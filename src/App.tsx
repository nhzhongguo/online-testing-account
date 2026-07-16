import {
  Activity,
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardPaste,
  Compass,
  Download,
  ExternalLink,
  FileJson,
  FolderOpen,
  Gauge,
  Globe2,
  KeyRound,
  Languages,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  PanelRight,
  Pause,
  Play,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  ShieldX,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  createSub2ApiExport,
  importAccountText,
  mergeAccounts,
  type AccountRecord,
  type AccountQuota,
  type ImportIssue,
  type OnlineStatus,
  type QuotaWindow,
} from './lib/accounts';
import { checkNetworkRegionMobile, isNativeMobile, validateCredentialMobile } from './lib/mobile-validator';
import { runSequentially } from './lib/sequential-runner';
import { ValidationController } from './lib/validation-controller';

type Filter = 'all' | 'untested' | 'alive' | 'unauthorized' | 'rate_limited' | 'attention';
type NetworkCheckState = NetworkCheckResult & { state: 'idle' | 'checking' | 'allowed' | 'blocked' | 'error' };
type ValidationRunState = 'idle' | 'running' | 'paused' | 'cancelling';

interface GuideStep {
  target: string;
  titleKey: string;
  descriptionKey: string;
}

interface GuideRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    target: '[data-guide="import"]',
    titleKey: 'guide.importTitle',
    descriptionKey: 'guide.importDescription',
  },
  {
    target: '[data-guide="search"]',
    titleKey: 'guide.searchTitle',
    descriptionKey: 'guide.searchDescription',
  },
  {
    target: '[data-guide="validate"]',
    titleKey: 'guide.validateTitle',
    descriptionKey: 'guide.validateDescription',
  },
  {
    target: '[data-guide="results"]',
    titleKey: 'guide.resultsTitle',
    descriptionKey: 'guide.resultsDescription',
  },
  {
    target: '[data-guide="cleanup"]',
    titleKey: 'guide.cleanupTitle',
    descriptionKey: 'guide.cleanupDescription',
  },
  {
    target: '[data-guide="export"]',
    titleKey: 'guide.exportTitle',
    descriptionKey: 'guide.exportDescription',
  },
];

const PAGE_SIZE = 100;
const IMPORT_BATCH_SIZE = 25;

interface ImportAggregate {
  accounts: AccountRecord[];
  issues: ImportIssue[];
  processedFiles: number;
}

function appendImportedDocuments(aggregate: ImportAggregate, documents: ImportedDocument[]) {
  for (const document of documents) {
    aggregate.processedFiles += 1;
    if (typeof document.text === 'string') {
      const result = importAccountText(document.text, document.name);
      aggregate.accounts.push(...result.accounts);
      aggregate.issues.push(...result.issues);
    } else if (document.error) {
      aggregate.issues.push({ sourceName: document.name, path: '$', reason: document.error });
    }
  }
}

function yieldToInterface() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

const onlineLabelKeys: Record<OnlineStatus, string> = {
  untested: 'status.untested',
  unsupported: 'status.unsupported',
  checking: 'status.checking',
  alive: 'status.alive',
  unauthorized: 'status.unauthorized',
  forbidden: 'status.forbidden',
  rate_limited: 'status.rate_limited',
  server_error: 'status.server_error',
  network_error: 'status.network_error',
};

const formatLabels: Record<AccountRecord['format'], string> = {
  'chatgpt-session': 'ChatGPT Session',
  '9router': '9router',
  codex: 'Codex',
  axonhub: 'AxonHub',
  'codex-manager': 'Codex-Manager',
  cpa: 'CPA',
  sub2api: 'sub2api',
  'api-key': 'OpenAI API',
  unknown: '通用 OAuth',
};

function StatusIcon({ status }: { status: OnlineStatus }) {
  if (status === 'alive') return <CheckCircle2 aria-hidden="true" />;
  if (status === 'checking') return <LoaderCircle className="spin" aria-hidden="true" />;
  if (status === 'unauthorized') return <Ban aria-hidden="true" />;
  if (status === 'rate_limited') return <RefreshCw aria-hidden="true" />;
  if (status === 'forbidden') return <LockKeyhole aria-hidden="true" />;
  if (status === 'network_error' || status === 'server_error') return <AlertCircle aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
}

function quotaRemaining(window: QuotaWindow) {
  return Math.max(0, Math.min(100, Math.round(100 - window.usedPercent)));
}

function quotaWindowLabel(window: QuotaWindow, fallback: string, t: TFunction) {
  if (!window.windowMinutes) return fallback;
  if (window.windowMinutes === 300) return t('quota.fiveHours');
  if (window.windowMinutes >= 10_000) return t('quota.weekly');
  if (window.windowMinutes % 1_440 === 0) return t('quota.days', { count: window.windowMinutes / 1_440 });
  if (window.windowMinutes % 60 === 0) return t('quota.hours', { count: window.windowMinutes / 60 });
  return t('quota.minutes', { count: window.windowMinutes });
}

function quotaResetLabel(t: TFunction, resetsAt?: number) {
  if (!resetsAt) return t('quota.resetUnknown');
  const remainingMinutes = Math.max(0, Math.ceil((resetsAt * 1000 - Date.now()) / 60_000));
  if (remainingMinutes < 60) return t('quota.resetMinutes', { count: remainingMinutes });
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  if (days) return t('quota.resetDays', { days, hours });
  return t('quota.resetHours', { hours, minutes: remainingMinutes % 60 });
}

function CompactQuota({ quota }: { quota?: AccountQuota }) {
  const { t } = useTranslation();
  const windows = quota ? [quota.primary, quota.secondary].filter(Boolean) as QuotaWindow[] : [];
  if (!windows.length) return <span className="quota-missing">{t('quota.afterValidation')}</span>;
  return (
    <div className="quota-compact">
      {windows.map((window, index) => {
        const remaining = quotaRemaining(window);
        return (
          <div key={`${window.windowMinutes || index}-${index}`}>
            <span>{quotaWindowLabel(window, index ? t('quota.long') : t('quota.short'), t)}</span>
            <i><b style={{ width: `${remaining}%` }} /></i>
            <strong>{remaining}%</strong>
          </div>
        );
      })}
    </div>
  );
}

function QuotaDetails({ quota }: { quota?: AccountQuota }) {
  const { t } = useTranslation();
  const windows = quota ? [quota.primary, quota.secondary].filter(Boolean) as QuotaWindow[] : [];
  if (!windows.length) return <div className="quota-empty"><Gauge /><span>{t('quota.empty')}</span></div>;
  return (
    <div className="quota-details">
      {windows.map((window, index) => {
        const remaining = quotaRemaining(window);
        return (
          <div className="quota-detail-row" key={`${window.windowMinutes || index}-${index}`}>
            <div><strong>{quotaWindowLabel(window, index ? t('quota.longQuota') : t('quota.shortQuota'), t)}</strong><span>{quotaResetLabel(t, window.resetsAt)}</span></div>
            <b>{t('quota.remaining', { percent: remaining })}</b>
            <div className="quota-track"><span style={{ width: `${remaining}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.resolvedLanguage === 'en';
  const nativeMobile = isNativeMobile();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [validateOpen, setValidateOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [openSourceOpen, setOpenSourceOpen] = useState(false);
  const [validationScope, setValidationScope] = useState<'batch' | 'all'>('batch');
  const [validationProgress, setValidationProgress] = useState({ done: 0, total: 0 });
  const [validationRunState, setValidationRunState] = useState<ValidationRunState>('idle');
  const [activeValidationId, setActiveValidationId] = useState<string>();
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [networkCheck, setNetworkCheck] = useState<NetworkCheckState>({
    state: 'idle',
    allowed: false,
    detail: '尚未检测当前出口 IP',
  });
  const [isQuotaRefreshing, setIsQuotaRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [currentPage, setCurrentPage] = useState(1);
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [guideRect, setGuideRect] = useState<GuideRect>();
  const [mobileView, setMobileView] = useState<'accounts' | 'details'>('accounts');
  const [showStartup, setShowStartup] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const validationControlRef = useRef(new ValidationController());
  const deferredQuery = useDeferredValue(query);
  const isValidating = validationRunState !== 'idle';
  const currentLanguage = i18n.resolvedLanguage;
  const localizedFormatLabels = useMemo(() => ({
    ...formatLabels,
    unknown: t('formats.oauth', { lng: currentLanguage }),
  }), [currentLanguage, t]);
  const filterOptions = useMemo<Array<[Filter, string]>>(() => [
    ['all', t('filters.all')],
    ['untested', t('filters.pending')],
    ['alive', t('filters.alive')],
    ['unauthorized', t('filters.invalid')],
    ['rate_limited', t('filters.limited')],
    ['attention', t('filters.attention')],
  ], [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowStartup(false), 1_800);
    return () => window.clearTimeout(timer);
  }, []);

  const stats = useMemo(() => {
    let alive = 0;
    let pending = 0;
    let unauthorized = 0;
    let rateLimited = 0;
    let tested = 0;
    for (const account of accounts) {
      if (['untested', 'unsupported', 'checking'].includes(account.onlineStatus)) pending += 1;
      else tested += 1;
      if (account.onlineStatus === 'alive') alive += 1;
      if (account.onlineStatus === 'unauthorized') unauthorized += 1;
      if (account.onlineStatus === 'rate_limited') rateLimited += 1;
    }
    return {
      alive,
      pending,
      unauthorized,
      rateLimited,
      tested,
      onlineRate: tested ? Math.round((alive / tested) * 100) : 0,
    };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery = !normalizedQuery || [
        account.email,
        account.accountId,
        account.plan,
        localizedFormatLabels[account.format],
        account.fingerprint,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      if (!matchesQuery) return false;
      if (filter === 'all') return true;
      if (filter === 'attention') {
        return ['unauthorized', 'forbidden', 'rate_limited', 'server_error', 'network_error'].includes(account.onlineStatus);
      }
      return account.onlineStatus === filter;
    });
  }, [accounts, deferredQuery, filter, localizedFormatLabels]);

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * PAGE_SIZE;
  const visibleAccounts = useMemo(
    () => filteredAccounts.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredAccounts, pageStart],
  );
  const selected = useMemo(
    () => accounts.find((account) => account.id === selectedId) ?? visibleAccounts[0],
    [accounts, selectedId, visibleAccounts],
  );
  const onlineCandidates = useMemo(
    () => accounts.filter((account) => !['checking', 'alive'].includes(account.onlineStatus)),
    [accounts],
  );
  const credentialFailures = useMemo(
    () => accounts.filter((account) => account.onlineStatus === 'unauthorized'),
    [accounts],
  );

  useEffect(() => {
    if (guideStep === null) return undefined;

    let animationFrame = 0;
    const updateGuideRect = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(GUIDE_STEPS[guideStep].target);
        if (!target) {
          setGuideRect(undefined);
          return;
        }
        const rect = target.getBoundingClientRect();
        setGuideRect({
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });
    };

    const target = document.querySelector<HTMLElement>(GUIDE_STEPS[guideStep].target);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    updateGuideRect();
    window.addEventListener('resize', updateGuideRect);
    window.addEventListener('scroll', updateGuideRect, true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGuideStep(null);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateGuideRect);
      window.removeEventListener('scroll', updateGuideRect, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [guideStep]);

  const guideIndex = guideStep ?? 0;
  const currentGuide = guideStep === null ? undefined : GUIDE_STEPS[guideIndex];
  const guideHighlightStyle = guideRect ? (() => {
    const top = Math.max(6, guideRect.top - 6);
    const left = Math.max(6, guideRect.left - 6);
    const right = Math.min(window.innerWidth - 6, guideRect.right + 6);
    const bottom = Math.min(window.innerHeight - 6, guideRect.bottom + 6);
    return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  })() : undefined;
  const guidePopoverStyle = guideRect ? (() => {
    const width = Math.min(330, window.innerWidth - 24);
    const left = Math.max(12, Math.min(guideRect.left, window.innerWidth - width - 12));
    const estimatedHeight = 220;
    const fitsBelow = guideRect.bottom + estimatedHeight + 24 <= window.innerHeight;
    const top = fitsBelow
      ? guideRect.bottom + 12
      : Math.max(12, Math.min(guideRect.top - estimatedHeight - 12, window.innerHeight - estimatedHeight - 12));
    return { left, top, width };
  })() : undefined;

  function closeGuide() {
    setGuideStep(null);
    setGuideRect(undefined);
  }

  function commitImport(aggregate: ImportAggregate, sourceLabel: string) {
    if (aggregate.accounts.length) {
      setAccounts((current) => mergeAccounts(current, aggregate.accounts));
      setSelectedId((current) => current ?? accounts[0]?.id ?? aggregate.accounts[0].id);
      setCurrentPage(1);
    }
    if (aggregate.issues.length) {
      setIssues((current) => [...current, ...aggregate.issues]);
    }
    setNotice(t('notices.importComplete', {
      source: sourceLabel,
      files: aggregate.processedFiles,
      accounts: aggregate.accounts.length.toLocaleString(i18n.resolvedLanguage),
    }) + (aggregate.issues.length ? t('notices.issues', { count: aggregate.issues.length }) : ''));
  }

  function ingestText(text: string, sourceName: string) {
    const aggregate: ImportAggregate = { accounts: [], issues: [], processedFiles: 0 };
    appendImportedDocuments(aggregate, [{ name: sourceName, text }]);
    commitImport(aggregate, t('notices.import'));
  }

  async function handlePickFiles() {
    if (window.accountPulse) {
      const documents = await window.accountPulse.pickFiles();
      if (!documents.length) return;
      setIsImporting(true);
      setImportProgress({ done: 0, total: documents.length });
      const aggregate: ImportAggregate = { accounts: [], issues: [], processedFiles: 0 };
      for (let offset = 0; offset < documents.length; offset += IMPORT_BATCH_SIZE) {
        appendImportedDocuments(aggregate, documents.slice(offset, offset + IMPORT_BATCH_SIZE));
        setImportProgress({ done: Math.min(offset + IMPORT_BATCH_SIZE, documents.length), total: documents.length });
        await yieldToInterface();
      }
      commitImport(aggregate, t('notices.fileImport'));
      setIsImporting(false);
      return;
    }
    fileInputRef.current?.click();
  }

  async function handlePickFolder() {
    if (!window.accountPulse) {
      folderInputRef.current?.setAttribute('webkitdirectory', '');
      folderInputRef.current?.click();
      return;
    }

    try {
      const selection = await window.accountPulse.pickFolder();
      if (!selection) return;
      if (!selection.total) {
        setNotice(t('notices.noJson'));
        return;
      }
      setIsImporting(true);
      setImportProgress({ done: 0, total: selection.total });
      const aggregate: ImportAggregate = { accounts: [], issues: [], processedFiles: 0 };
      let finished = false;
      while (!finished) {
        const batch = await window.accountPulse.readFolderBatch(selection.id);
        appendImportedDocuments(aggregate, batch.documents);
        setImportProgress({ done: batch.done, total: batch.total });
        finished = batch.finished;
        await yieldToInterface();
      }
      commitImport(aggregate, t('notices.folderImport', { name: selection.name }));
    } catch (error) {
      setNotice(error instanceof Error ? t('notices.folderFailed', { message: error.message }) : t('notices.folderFailedGeneric'));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleFiles(files: FileList | File[], sourceLabel = t('notices.fileImport')) {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    setIsImporting(true);
    setImportProgress({ done: 0, total: selectedFiles.length });
    const aggregate: ImportAggregate = { accounts: [], issues: [], processedFiles: 0 };

    for (let offset = 0; offset < selectedFiles.length; offset += IMPORT_BATCH_SIZE) {
      const batchFiles = selectedFiles.slice(offset, offset + IMPORT_BATCH_SIZE);
      const documents = await Promise.all(batchFiles.map(async (file): Promise<ImportedDocument> => {
        const name = file.webkitRelativePath || file.name;
        if (!file.name.toLowerCase().endsWith('.json')) return { name, error: t('notices.jsonOnly') };
        if (file.size > 10 * 1024 * 1024) return { name, error: t('notices.tooLarge') };
        return { name, text: await file.text() };
      }));
      appendImportedDocuments(aggregate, documents);
      setImportProgress({ done: Math.min(offset + IMPORT_BATCH_SIZE, selectedFiles.length), total: selectedFiles.length });
      await yieldToInterface();
    }

    commitImport(aggregate, sourceLabel);
    setIsImporting(false);
  }

  function validationInputFor(account: AccountRecord): ValidationInput {
    return {
      credentialKind: account.credentialKind,
      credential: account.credential,
      refreshCredential: account.refreshCredential,
      clientId: account.clientId,
      accountId: account.accountId,
      expiresAt: account.expiresAt,
    };
  }

  async function requestValidation(input: ValidationInput): Promise<ValidationResult> {
    if (window.accountPulse) return window.accountPulse.validateCredential(input);
    if (nativeMobile) return validateCredentialMobile(input);
    const response = await fetch('/__account-pulse/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return response.json() as Promise<ValidationResult>;
  }

  async function checkCurrentNetwork(): Promise<NetworkCheckResult> {
    setNetworkCheck({ state: 'checking', allowed: false, detail: t('notices.checkingIp') });
    try {
      const result = window.accountPulse
        ? await window.accountPulse.checkNetworkRegion()
        : nativeMobile
          ? await checkNetworkRegionMobile()
        : await fetch('/__account-pulse/network-check').then((response) => response.json() as Promise<NetworkCheckResult>);
      setNetworkCheck({
        ...result,
        state: result.allowed ? 'allowed' : result.countryCode === 'CN' ? 'blocked' : 'error',
      });
      return result;
    } catch {
      const result = { allowed: false, detail: t('notices.ipCheckFailed') };
      setNetworkCheck({ ...result, state: 'error' });
      return result;
    }
  }

  function openValidationDialog() {
    setValidateOpen(true);
    void checkCurrentNetwork();
  }

  function pauseValidation() {
    if (validationRunState !== 'running') return;
    validationControlRef.current.pause();
    setValidationRunState('paused');
  }

  function resumeValidation() {
    if (validationRunState !== 'paused') return;
    if (validationControlRef.current.isCancelled()) return;
    validationControlRef.current.resume();
    setValidationRunState('running');
  }

  function cancelValidation() {
    if (validationRunState === 'idle' || validationRunState === 'cancelling') return;
    validationControlRef.current.cancel();
    setValidationRunState('cancelling');
  }

  function handlePasteImport() {
    if (!pasteValue.trim()) return;
    ingestText(pasteValue, 'pasted-json');
    setPasteValue('');
    setPasteOpen(false);
  }

  async function runOnlineValidation() {
    const network = await checkCurrentNetwork();
    if (!network.allowed) return;
    setValidateOpen(false);
    validationControlRef.current.reset();
    setValidationRunState('running');

    const pending = accounts.filter((account) => ['untested', 'unsupported'].includes(account.onlineStatus));
    const retryable = accounts.filter((account) => !['untested', 'unsupported', 'checking', 'alive'].includes(account.onlineStatus));
    const candidates = [...pending, ...retryable];
    const batch = validationScope === 'all' ? candidates : candidates.slice(0, 25);
    if (!batch.length) {
      setValidationRunState('idle');
      setNotice(t('notices.noAccounts'));
      return;
    }
    setValidationProgress({ done: 0, total: batch.length });

    const bufferedResults = new Map<string, ValidationResult>();
    let completed = 0;
    const resultFlushStep = Math.max(1, Math.ceil(batch.length / 500));
    const flushResults = () => {
      if (!bufferedResults.size) return;
      const completedResults = new Map(bufferedResults);
      bufferedResults.clear();
      setAccounts((current) => current.map((account) => {
        const result = completedResults.get(account.id);
        if (!result) return account;
        return {
          ...account,
          credential: result.credential || account.credential,
          refreshCredential: result.refreshCredential || account.refreshCredential,
          expiresAt: result.expiresAt || account.expiresAt,
          localStatus: result.expiresAt ? 'current' : account.localStatus,
          localDetail: result.expiresAt ? t('notices.tokenRefreshed') : account.localDetail,
          onlineStatus: result.status,
          onlineDetail: result.detail,
          checkedAt: Date.now(),
          quota: result.quota || account.quota,
        };
      }));
    };

    await runSequentially(batch, async (account) => {
      if (!await validationControlRef.current.waitForPermission()) return false;
      setActiveValidationId(account.id);
      let result: ValidationResult;
      try {
        result = await requestValidation(validationInputFor(account));
      } catch {
        result = { status: 'network_error', detail: t('notices.validationServiceFailed') };
      }
      bufferedResults.set(account.id, result);
      completed += 1;
      setValidationProgress({ done: completed, total: batch.length });
      if (completed === batch.length || completed % resultFlushStep === 0) {
        flushResults();
        await yieldToInterface();
      }
      setActiveValidationId(undefined);
      return true;
    });

    flushResults();
    setActiveValidationId(undefined);
    const cancelled = validationControlRef.current.isCancelled();
    validationControlRef.current.reset();
    setValidationRunState('idle');
    setNotice(cancelled
      ? t('notices.validationCancelled', { done: completed, total: batch.length })
      : t('notices.validationComplete', { count: completed }));
  }

  async function refreshSelectedQuota() {
    if (!selected || selected.credentialKind !== 'oauth') return;
    setIsQuotaRefreshing(true);
    const network = await checkCurrentNetwork();
    if (!network.allowed) {
      setNotice(network.detail);
      setIsQuotaRefreshing(false);
      return;
    }
    try {
      const result = await requestValidation(validationInputFor(selected));
      setAccounts((current) => current.map((account) => account.id === selected.id
        ? {
            ...account,
            credential: result.credential || account.credential,
            refreshCredential: result.refreshCredential || account.refreshCredential,
            expiresAt: result.expiresAt || account.expiresAt,
            onlineStatus: result.status,
            onlineDetail: result.detail,
            checkedAt: Date.now(),
            quota: result.quota || account.quota,
          }
        : account));
      setNotice(result.quota ? t('notices.quotaRefreshed') : t('notices.quotaUnavailable', { detail: result.detail }));
    } catch {
      setNotice(t('notices.quotaFailed'));
    } finally {
      setIsQuotaRefreshing(false);
    }
  }

  async function exportRetainedAccounts() {
    const retainedCount = accounts.length - credentialFailures.length;
    const content = JSON.stringify(createSub2ApiExport(accounts), null, 2);
    const suggestedName = `online-testing-account-usable-${retainedCount}-${new Date().toISOString().slice(0, 10)}.json`;
    if (window.accountPulse) {
      const result = await window.accountPulse.saveJson(content, suggestedName);
      if (result.saved) setNotice(t('notices.exported', { count: retainedCount }));
      return;
    }
    if (nativeMobile) {
      const result = await Filesystem.writeFile({
        path: suggestedName,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: t('actions.exportRemaining'),
        files: [result.uri],
        dialogTitle: t('actions.exportRemaining'),
      });
      setNotice(t('notices.exported', { count: retainedCount }));
      return;
    }
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function deleteCredentialFailures() {
    const failedIds = new Set(credentialFailures.map((account) => account.id));
    setAccounts((current) => current.filter((account) => !failedIds.has(account.id)));
    if (selectedId && failedIds.has(selectedId)) setSelectedId(undefined);
    setCleanupOpen(false);
    setNotice(t('notices.deleted', { count: failedIds.size }));
  }

  function formatCheckTime(timestamp?: number) {
    if (!timestamp) return t('notices.notValidated');
    return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(timestamp);
  }

  function clearAll() {
    setAccounts([]);
    setIssues([]);
    setSelectedId(undefined);
    setNotice(undefined);
  }

  return (
    <div
      className="app-shell"
      data-validation-state={validationRunState}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
    >
      {showStartup && (
        <div className="startup-screen" role="status" aria-label={t('splash.loading')}>
          <div className="startup-brand">
            <div className="startup-icon"><img src="./app-icon.png" alt="" /></div>
            <h1>Online testing account</h1>
            <p>{t('splash.subtitle')}</p>
            <div className="startup-scan"><span /></div>
            <small>{t('splash.loading')}</small>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><img src="./app-icon.png" alt="" /></div>
          <div className="brand-copy">
            <div className="brand-title-row"><h1>Online testing account</h1><span>{t('brand.version')}</span></div>
            <p>{t('brand.subtitle')}</p>
          </div>
        </div>
        <div className="header-status">
          <button className="open-source-button" onClick={() => setGuideStep(0)}>
            <Compass aria-hidden="true" />{t('header.guide')}
          </button>
          <button className="open-source-button" onClick={() => setOpenSourceOpen(true)}>
            <Scale aria-hidden="true" />{t('header.openSource')}
          </button>
          <button className="open-source-button language-button" onClick={() => void i18n.changeLanguage(isEnglish ? 'zh' : 'en')} title={t('header.switchLanguage')}>
            <Languages aria-hidden="true" />{isEnglish ? '中文' : 'EN'}
          </button>
          <span className="privacy-state"><ShieldCheck aria-hidden="true" /> {t('header.privacy')}</span>
          <span className="runtime-state">
            <span className={`runtime-dot ${window.accountPulse ? 'desktop' : nativeMobile ? 'mobile' : 'web'}`} />
            {window.accountPulse ? t('header.desktop') : nativeMobile ? t('header.mobile') : t('header.preview')}
          </span>
        </div>
      </header>

      <section className="metrics" aria-label={t('metrics.label')}>
        <div className="metric-primary online">
          <span className="metric-label">{t('metrics.rate')}</span>
          <strong>{stats.onlineRate}%</strong>
          <span>{t('metrics.verifiedRatio', { alive: stats.alive, tested: stats.tested })}</span>
        </div>
        <div className="metric-primary">
          <span className="metric-label">{t('metrics.verified')}</span>
          <strong>{stats.tested}</strong>
          <span>{t('metrics.verifiedHint')}</span>
        </div>
        <div className="metric-compact"><CircleHelp /><span>{t('metrics.pending')}</span><strong>{stats.pending}</strong></div>
        <div className="metric-compact danger"><Ban /><span>{t('metrics.invalid')}</span><strong>{stats.unauthorized}</strong></div>
        <div className="metric-compact warning"><RefreshCw /><span>{t('metrics.limited')}</span><strong>{stats.rateLimited}</strong></div>
        <div className="metric-compact"><FileJson /><span>{t('metrics.total')}</span><strong>{accounts.length}</strong></div>
      </section>

      <div className="mobile-view-switch" role="tablist" aria-label={t('mobile.accounts')}>
        <button role="tab" aria-selected={mobileView === 'accounts'} className={mobileView === 'accounts' ? 'active' : ''} onClick={() => setMobileView('accounts')}><ListFilter />{t('mobile.accounts')}</button>
        <button role="tab" aria-selected={mobileView === 'details'} className={mobileView === 'details' ? 'active' : ''} onClick={() => setMobileView('details')} disabled={!selected}><PanelRight />{t('mobile.details')}</button>
      </div>

      <main className="workspace" data-mobile-view={mobileView}>
        <section className="account-pane">
          <div className="toolbar">
            <div className="toolbar-actions">
              <button className="button primary" data-guide="import" onClick={() => void handlePickFolder()} disabled={isImporting || isValidating}>
                {isImporting ? <LoaderCircle className="spin" /> : <FolderOpen />}
                {isImporting ? `${importProgress.done}/${importProgress.total}` : t('actions.importFolder')}
              </button>
              <button className="button secondary" onClick={() => void handlePickFiles()} disabled={isImporting || isValidating}>
                <FileJson />{t('actions.importFiles')}
              </button>
              <button className="icon-button" onClick={() => setPasteOpen(true)} disabled={isImporting || isValidating} title={t('actions.pasteJson')} aria-label={t('actions.pasteJson')}>
                <ClipboardPaste />
              </button>
              {validationRunState === 'idle' ? (
                <button
                  className="button verify validation-control idle"
                  data-guide="validate"
                  onClick={openValidationDialog}
                  disabled={!onlineCandidates.length || isImporting}
                >
                  <ShieldCheck />{t('actions.validate')}
                </button>
              ) : (
                <>
                  <button
                    className={`button verify validation-control ${validationRunState}`}
                    data-guide="validate"
                    onClick={validationRunState === 'paused' ? resumeValidation : pauseValidation}
                    disabled={validationRunState === 'cancelling'}
                  >
                    {validationRunState === 'cancelling'
                      ? <LoaderCircle className="spin" />
                      : validationRunState === 'paused' ? <Play /> : <Pause />}
                    {validationRunState === 'cancelling'
                      ? t('actions.cancellingValidation')
                      : `${t(validationRunState === 'paused' ? 'actions.resumeValidation' : 'actions.pauseValidation')} · ${validationProgress.done}/${validationProgress.total}`}
                  </button>
                  <button className="button danger cancel-validation" onClick={cancelValidation} disabled={validationRunState === 'cancelling'}>
                    <X />{t('actions.cancelValidation')}
                  </button>
                </>
              )}
              <button className="button danger" data-guide="cleanup" onClick={() => setCleanupOpen(true)} disabled={!credentialFailures.length || isValidating || isImporting} title={t('cleanup.title')}>
                <ShieldX />{t('actions.deleteInvalid')} {credentialFailures.length || ''}
              </button>
              <button className="button secondary" data-guide="export" onClick={() => void exportRetainedAccounts()} disabled={!accounts.length || isImporting || isValidating} title={t('actions.exportRemaining')}>
                <Download />{t('actions.exportRemaining')}
              </button>
              <button className="icon-button danger" onClick={clearAll} disabled={isImporting || isValidating || (!accounts.length && !issues.length)} title={t('actions.clear')} aria-label={t('actions.clear')}>
                <Trash2 />
              </button>
            </div>
            <label className="search-box" data-guide="search">
              <Search aria-hidden="true" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); setSelectedId(undefined); }} placeholder={t('search.placeholder')} />
              {query && <button onClick={() => { setQuery(''); setCurrentPage(1); setSelectedId(undefined); }} aria-label={t('search.clear')}><X /></button>}
            </label>
          </div>

          <div className="filter-row">
            {filterOptions.map(([value, label]) => (
              <button key={value} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value); setCurrentPage(1); setSelectedId(undefined); }}>{label}</button>
            ))}
            <span className="filter-total">{t('filters.count', { count: filteredAccounts.length.toLocaleString(i18n.resolvedLanguage) })}</span>
          </div>

          <div className="table-wrap" data-guide="results">
            {accounts.length ? (
              <table>
                <thead>
                  <tr>
                    <th>{t('table.account')}</th>
                    <th>{t('table.source')}</th>
                    <th>{t('table.status')}</th>
                    <th>{t('table.quota')}</th>
                    <th>{t('table.checkedAt')}</th>
                    <th aria-label={t('table.details')} />
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((account) => {
                    const displayStatus = activeValidationId === account.id ? 'checking' : account.onlineStatus;
                    return (
                    <tr key={account.id} className={selected?.id === account.id ? 'selected' : ''} onClick={() => { setSelectedId(account.id); setMobileView('details'); }}>
                      <td>
                        <strong className="account-email">{account.email}</strong>
                        <span className="account-sub">{account.accountId || account.credentialPreview}</span>
                      </td>
                      <td><span className="format-label">{localizedFormatLabels[account.format]}</span></td>
                      <td><span className={`status ${displayStatus}`}><StatusIcon status={displayStatus} />{t(onlineLabelKeys[displayStatus])}</span></td>
                      <td><CompactQuota quota={account.quota} /></td>
                      <td className="mono">{formatCheckTime(account.checkedAt)}</td>
                      <td><ChevronRight className="row-arrow" /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><UploadCloud /></div>
                <h2>{t('empty.title')}</h2>
                <p>ChatGPT Session、Codex、CPA、sub2api、9router</p>
                <div className="empty-actions">
                  <button className="button primary" onClick={() => void handlePickFolder()}><FolderOpen />{t('actions.importFolder')}</button>
                  <button className="button secondary" onClick={() => void handlePickFiles()}><FileJson />{t('actions.importFiles')}</button>
                </div>
              </div>
            )}
            {accounts.length > 0 && !filteredAccounts.length && (
              <div className="no-results"><Search /><span>{t('table.noResults')}</span></div>
            )}
          </div>
          {filteredAccounts.length > 0 && (
            <div className="table-pagination" aria-label={t('table.pagination')}>
              <span>{t('table.pageSummary', { start: (pageStart + 1).toLocaleString(i18n.resolvedLanguage), end: Math.min(pageStart + PAGE_SIZE, filteredAccounts.length).toLocaleString(i18n.resolvedLanguage), count: filteredAccounts.length.toLocaleString(i18n.resolvedLanguage) })}</span>
              <div>
                <button className="icon-button" onClick={() => { setCurrentPage(visiblePage - 1); setSelectedId(undefined); }} disabled={visiblePage <= 1} title={t('table.previousPage')} aria-label={t('table.previousPage')}><ChevronLeft /></button>
                <strong>{t('table.page', { page: visiblePage.toLocaleString(i18n.resolvedLanguage), total: totalPages.toLocaleString(i18n.resolvedLanguage) })}</strong>
                <button className="icon-button" onClick={() => { setCurrentPage(visiblePage + 1); setSelectedId(undefined); }} disabled={visiblePage >= totalPages} title={t('table.nextPage')} aria-label={t('table.nextPage')}><ChevronRight /></button>
              </div>
            </div>
          )}
        </section>

        <aside className="detail-pane">
          {selected ? (
            <>
              <div className="detail-head">
                <div className={`account-avatar ${selected.onlineStatus === 'alive' ? 'alive' : ''}`}>
                  {selected.credentialKind === 'api_key' ? <KeyRound /> : <LockKeyhole />}
                </div>
                <div>
                  <span className="eyebrow">{t('details.title')}</span>
                  <h2>{selected.email}</h2>
                  <p>{localizedFormatLabels[selected.format]}</p>
                </div>
                <button className="icon-button" onClick={() => {
                  setAccounts((current) => current.filter((account) => account.id !== selected.id));
                  setSelectedId(undefined);
                }} title={t('details.deleteAccount')} aria-label={t('details.deleteAccount')}><Trash2 /></button>
              </div>

              <div className="detail-section">
                <h3>{t('details.conclusion')}</h3>
                <div className={`verdict ${activeValidationId === selected.id ? 'checking' : selected.onlineStatus}`}>
                  <StatusIcon status={activeValidationId === selected.id ? 'checking' : selected.onlineStatus} />
                  <div>
                    <strong>{t(onlineLabelKeys[activeValidationId === selected.id ? 'checking' : selected.onlineStatus])}</strong>
                    <span>{activeValidationId === selected.id ? t('validation.checkingAccount') : selected.onlineDetail || t('details.notValidated')}</span>
                  </div>
                </div>
              </div>

              {selected.credentialKind === 'oauth' && (
                <div className="detail-section">
                  <div className="detail-section-title">
                    <div><h3>{t('quota.title')}</h3><span>{t('quota.subtitle')}</span></div>
                    <button className="button secondary compact-button" onClick={() => void refreshSelectedQuota()} disabled={isQuotaRefreshing || isValidating || isImporting}>
                      {isQuotaRefreshing ? <LoaderCircle className="spin" /> : <RefreshCw />}{t('actions.refreshQuota')}
                    </button>
                  </div>
                  <QuotaDetails quota={selected.quota} />
                </div>
              )}

              <div className="detail-section">
                <h3>{t('details.credentials')}</h3>
                <dl className="details-list">
                  <div><dt>{t('details.credential')}</dt><dd className="mono">{selected.credentialPreview}</dd></div>
                  <div><dt>{t('details.fingerprint')}</dt><dd className="mono">{selected.fingerprint}</dd></div>
                  <div><dt>{t('details.refreshToken')}</dt><dd>{selected.hasRefreshToken ? t('details.exists') : t('details.missing')}</dd></div>
                  <div><dt>{t('details.plan')}</dt><dd>{selected.plan || t('details.unknown')}</dd></div>
                  <div><dt>{t('details.checkedAt')}</dt><dd>{formatCheckTime(selected.checkedAt)}</dd></div>
                  <div><dt>{t('details.sourceFile')}</dt><dd title={`${selected.sourceName} ${selected.sourcePath}`}>{selected.sourceName}</dd></div>
                </dl>
              </div>

              <div className="detail-section boundary-note">
                <ShieldCheck />
                <div>
                  <strong>{selected.credentialKind === 'api_key' ? t('details.apiSupported') : t('details.codexSupported')}</strong>
                  <span>{selected.credentialKind === 'api_key'
                    ? t('details.apiHint')
                    : t('details.codexHint')}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="detail-empty"><Activity /><span>{t('empty.details')}</span></div>
          )}
        </aside>
      </main>

      {notice && <div className="toast"><CheckCircle2 />{notice}<button onClick={() => setNotice(undefined)} aria-label={t('actions.close')}><X /></button></div>}
      {isDragging && <div className="drop-overlay"><UploadCloud /><strong>{t('notices.drop')}</strong></div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files, t('notices.folderImport', { name: event.target.files[0]?.webkitRelativePath.split('/')[0] || t('notices.import') }));
          event.target.value = '';
        }}
      />

      {pasteOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPasteOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="paste-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">{t('paste.eyebrow')}</span><h2 id="paste-title">{t('paste.title')}</h2></div><button className="icon-button" onClick={() => setPasteOpen(false)} aria-label={t('actions.close')}><X /></button></div>
            <textarea value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} spellCheck={false} autoFocus placeholder="{ }" />
            <div className="modal-actions"><button className="button secondary" onClick={() => setPasteOpen(false)}>{t('actions.cancel')}</button><button className="button primary" onClick={handlePasteImport} disabled={!pasteValue.trim()}><FileJson />{t('actions.parseImport')}</button></div>
          </div>
        </div>
      )}

      {validateOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setValidateOpen(false)}>
          <div className="modal compact" role="dialog" aria-modal="true" aria-labelledby="validate-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow">{t('validation.eyebrow')}</span><h2 id="validate-title">{t('validation.title')}</h2></div><button className="icon-button" onClick={() => setValidateOpen(false)} aria-label={t('actions.close')}><X /></button></div>
            <div className="network-requirement"><Globe2 /><div><strong>{t('validation.foreignIp')}</strong><span>{t('validation.foreignIpHint')}</span></div></div>
            <div className={`network-check-row ${networkCheck.state}`}>
              {networkCheck.state === 'checking' ? <LoaderCircle className="spin" /> : networkCheck.allowed ? <CheckCircle2 /> : <AlertCircle />}
              <div><strong>{networkCheck.allowed ? t('validation.ipConfirmed') : networkCheck.state === 'checking' ? t('validation.checkingIp') : t('validation.networkBlocked')}</strong><span>{networkCheck.ip ? `${networkCheck.ip} · ${networkCheck.countryCode || t('details.unknown')} · ` : ''}{networkCheck.detail}</span></div>
              <button className="icon-button" onClick={() => void checkCurrentNetwork()} disabled={networkCheck.state === 'checking'} title={t('actions.retryIp')} aria-label={t('actions.retryIp')}><RefreshCw /></button>
            </div>
            <div className="validation-summary"><ShieldCheck /><div><strong>{t('validation.available', { count: onlineCandidates.length })}</strong><span>{t('validation.hint')}</span></div></div>
            <div className="scope-options" role="radiogroup" aria-label={t('validation.scope')}>
              <label><input type="radio" name="validation-scope" checked={validationScope === 'batch'} onChange={() => setValidationScope('batch')} /><span>{t('validation.batch')}</span></label>
              <label><input type="radio" name="validation-scope" checked={validationScope === 'all'} onChange={() => setValidationScope('all')} /><span>{t('validation.all')}</span></label>
            </div>
            <div className="modal-actions"><button className="button secondary" onClick={() => setValidateOpen(false)}>{t('actions.cancel')}</button><button className="button verify" onClick={() => void runOnlineValidation()} disabled={!networkCheck.allowed || networkCheck.state === 'checking'}><ShieldCheck />{t('actions.startValidation')}</button></div>
          </div>
        </div>
      )}

      {cleanupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCleanupOpen(false)}>
          <div className="modal compact" role="dialog" aria-modal="true" aria-labelledby="cleanup-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><span className="eyebrow danger-text">{t('cleanup.eyebrow')}</span><h2 id="cleanup-title">{t('cleanup.title')}</h2></div><button className="icon-button" onClick={() => setCleanupOpen(false)} aria-label={t('actions.close')}><X /></button></div>
            <div className="validation-summary danger-summary"><ShieldX /><div><strong>{t('cleanup.count', { count: credentialFailures.length })}</strong><span>{t('cleanup.hint')}</span></div></div>
            <div className="modal-actions"><button className="button secondary" onClick={() => setCleanupOpen(false)}>{t('actions.cancel')}</button><button className="button danger" onClick={deleteCredentialFailures}><Trash2 />{t('actions.confirmDelete')}</button></div>
          </div>
        </div>
      )}

      {openSourceOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpenSourceOpen(false)}>
          <div className="modal open-source-modal" role="dialog" aria-modal="true" aria-labelledby="open-source-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="eyebrow">{t('openSource.eyebrow')}</span><h2 id="open-source-title">{t('openSource.title')}</h2></div>
              <button className="icon-button" onClick={() => setOpenSourceOpen(false)} aria-label={t('actions.close')}><X /></button>
            </div>

            <div className="attribution-summary">
              <Scale aria-hidden="true" />
              <div>
                <strong>Online testing account</strong>
                <span>{t('openSource.maintainer')}</span>
                <span>{t('openSource.collaboration')}</span>
              </div>
              <span className="license-badge">MIT</span>
            </div>

            <section className="notice-section" aria-labelledby="dependencies-title">
              <div className="notice-section-head">
                <div><h3 id="dependencies-title">{t('openSource.dependencies')}</h3><p>{t('openSource.dependenciesHint')}</p></div>
              </div>
              <div className="dependency-grid">
                <span>React / React DOM <b>MIT</b></span>
                <span>Electron <b>MIT</b></span>
                <span>Vite / Vitest <b>MIT</b></span>
                <span>TypeScript <b>Apache-2.0</b></span>
                <span>Lucide React <b>ISC</b></span>
                <span>electron-builder <b>MIT</b></span>
                <span>Capacitor <b>MIT</b></span>
                <span>i18next <b>MIT</b></span>
              </div>
            </section>

            <section className="notice-section" aria-labelledby="references-title">
              <div className="notice-section-head">
                <div><h3 id="references-title">{t('openSource.references')}</h3><p>{t('openSource.referencesHint')}</p></div>
              </div>
              <div className="project-list">
                <a href="https://github.com/openai/codex" target="_blank" rel="noreferrer">
                  <span><strong>openai/codex</strong><small>{t('openSource.codexRef')}</small></span>
                  <span className="project-license">Apache-2.0 <ExternalLink /></span>
                </a>
                <a href="https://github.com/lbjlaq/Antigravity-Manager" target="_blank" rel="noreferrer">
                  <span><strong>lbjlaq/Antigravity-Manager</strong><small>{t('openSource.antigravityRef')}</small></span>
                  <span className="project-license">CC BY-NC-SA 4.0 <ExternalLink /></span>
                </a>
                <a href="https://github.com/gtxx3600/GPTSession2CPAandSub2API" target="_blank" rel="noreferrer">
                  <span><strong>gtxx3600/GPTSession2CPAandSub2API</strong><small>{t('openSource.converterRef')}</small></span>
                  <span className="project-license">MIT <ExternalLink /></span>
                </a>
                <a href="https://github.com/Wei-Shaw/sub2api" target="_blank" rel="noreferrer">
                  <span><strong>Wei-Shaw/sub2api</strong><small>{t('openSource.sub2apiRef')}</small></span>
                  <span className="project-license">LGPL-3.0 <ExternalLink /></span>
                </a>
              </div>
            </section>

            <div className="notice-footnote">
              {t('openSource.footnote')}
            </div>
            <div className="modal-actions"><button className="button primary" onClick={() => setOpenSourceOpen(false)}>{t('actions.understood')}</button></div>
          </div>
        </div>
      )}

      {currentGuide && guideRect && guideHighlightStyle && guidePopoverStyle && (
        <>
          <div className="guide-blocker" aria-hidden="true" />
          <div className="guide-highlight" style={guideHighlightStyle} aria-hidden="true" />
          <div className="guide-popover" style={guidePopoverStyle} role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-description">
            <div className="guide-head">
              <div><span className="eyebrow">{t('guide.label', { current: guideIndex + 1, total: GUIDE_STEPS.length })}</span><h2 id="guide-title">{t(currentGuide.titleKey)}</h2></div>
              <button className="icon-button" onClick={closeGuide} title={t('actions.exitGuide')} aria-label={t('actions.exitGuide')}><X /></button>
            </div>
            <p id="guide-description">{t(currentGuide.descriptionKey)}</p>
            <div className="guide-progress" aria-hidden="true">
              {GUIDE_STEPS.map((step, index) => <span key={step.titleKey} className={index === guideIndex ? 'active' : index < guideIndex ? 'complete' : ''} />)}
            </div>
            <div className="guide-actions">
              <button className="button secondary" onClick={() => setGuideStep(guideIndex - 1)} disabled={guideIndex === 0}><ChevronLeft />{t('actions.previous')}</button>
              <button className="button primary" onClick={() => {
                if (guideIndex === GUIDE_STEPS.length - 1) closeGuide();
                else setGuideStep(guideIndex + 1);
              }}>
                {guideIndex === GUIDE_STEPS.length - 1 ? <CheckCircle2 /> : <ChevronRight />}
                {guideIndex === GUIDE_STEPS.length - 1 ? t('actions.finish') : t('actions.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
