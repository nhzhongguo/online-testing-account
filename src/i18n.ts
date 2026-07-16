import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: { translation: {
    brand: { subtitle: '在线账号成活与额度检测', version: 'v0.8' },
    header: { guide: '操作指引', openSource: '开源声明', privacy: '凭据仅保留在当前进程', desktop: '桌面模式', mobile: '移动端', preview: '浏览器预览', switchLanguage: 'Switch to English' },
    splash: { subtitle: '账号状态与 Codex 额度检测', loading: '正在启动安全检测环境' },
    metrics: { label: '账号检测统计', rate: '在线成活率', verifiedRatio: '{{alive}} / {{tested}} 已验证', verified: '已验证账号', verifiedHint: '实际请求已返回结果', pending: '待验证', invalid: '凭据失效', limited: '被限流', total: '总账号' },
    actions: { importFolder: '导入文件夹', importFiles: '导入文件', pasteJson: '粘贴 JSON', validate: '在线验证', deleteInvalid: '删除失效', exportRemaining: '导出剩余', clear: '清空', close: '关闭', cancel: '取消', refreshQuota: '刷新额度', previous: '上一步', next: '下一步', finish: '完成', exitGuide: '退出指引', retryIp: '重新检测 IP', startValidation: '开始验证', confirmDelete: '确认删除', parseImport: '解析并导入', understood: '知道了' },
    mobile: { accounts: '账号列表', details: '账号详情' },
    search: { placeholder: '搜索邮箱、账号 ID、格式', clear: '清除搜索' },
    filters: { all: '全部', pending: '待验证', alive: '在线正常', invalid: '凭据失效', limited: '被限流', attention: '需处理', count: '{{count}} 个账号' },
    table: { account: '账号', source: '来源', status: '在线状态', quota: 'Codex 额度', checkedAt: '验证时间', details: '详情', noResults: '没有匹配的账号', pagination: '账号分页', pageSummary: '显示 {{start}}-{{end}}，共 {{count}} 条', page: '第 {{page}} / {{total}} 页', previousPage: '上一页', nextPage: '下一页' },
    empty: { title: '等待账号数据', details: '选择账号查看详情' },
    status: { untested: '未验证', unsupported: '待验证', checking: '验证中', alive: '在线正常', unauthorized: '凭据失效', forbidden: '无权限', rate_limited: '被限流', server_error: '服务异常', network_error: '网络失败' },
    formats: { oauth: '通用 OAuth' },
    quota: { fiveHours: '5 小时', weekly: '周额度', days: '{{count}} 天', hours: '{{count}} 小时', minutes: '{{count}} 分钟', short: '短期', long: '长期', shortQuota: '短期额度', longQuota: '长期额度', resetUnknown: '重置时间未知', resetMinutes: '{{count}} 分钟后重置', resetHours: '{{hours}} 小时 {{minutes}} 分钟后重置', resetDays: '{{days}} 天 {{hours}} 小时后重置', afterValidation: '验证后显示', empty: '在线验证后显示 5 小时和周额度', remaining: '{{percent}}% 剩余', title: 'Codex 额度', subtitle: '订阅账号的短期和长期用量窗口' },
    details: { title: '账号详情', conclusion: '检测结论', notValidated: '尚未执行在线验证', credentials: '凭据信息', credential: '凭据', fingerprint: '指纹', refreshToken: 'Refresh Token', exists: '存在', missing: '缺失', plan: '套餐', unknown: '未知', checkedAt: '验证时间', sourceFile: '来源文件', deleteAccount: '删除该账号', apiSupported: '支持官方 API 在线验证', codexSupported: '支持 Codex 上游实际验证', apiHint: '在线检查通过本地原生网络发送，结果不会包含凭据。', codexHint: '发送最小模型请求，根据实际 HTTP 响应判断账号状态。' },
    paste: { eyebrow: '本地解析', title: '粘贴账号 JSON' },
    validation: { eyebrow: '实际请求', title: '在线验证账号', foreignIp: '必须开启国外 IP / 代理', foreignIpHint: '验证请求和 IP 检测都从本机原生网络发出；中国大陆出口或检测失败时不能开始。', ipConfirmed: '国外 IP 已确认', checkingIp: '正在检测出口 IP', networkBlocked: '当前网络不可验证', available: '{{count}} 个账号可验证', hint: 'OAuth 发送最小 Codex 模型请求并读取 5 小时/周额度；API Key 请求模型列表。', scope: '验证范围', batch: '本批 25 个', all: '全部待验证账号' },
    cleanup: { eyebrow: '清理结果', title: '删除凭据失效账号', count: '{{count}} 个账号将被删除', hint: '仅删除在线验证返回 401 的凭据；限流、无权限、网络失败和未验证账号都会保留。' },
    openSource: { eyebrow: '作者与许可证', title: '开源声明', maintainer: '作者与维护者：豫晨', collaboration: '豫晨 × OpenAI Codex 协作开发', dependencies: '核心开源依赖', dependenciesHint: '应用运行、界面与构建直接使用的主要项目', references: '参考与格式兼容项目', referencesHint: '用于研究账号状态与兼容导入格式', codexRef: '官方额度窗口与限流字段映射参考', antigravityRef: '账号状态分类概念参考', converterRef: '账号 JSON 格式兼容参考', sub2apiRef: 'sub2api 导入结构与检测行为参考', footnote: '上述参考项目的源码未打包进 Online testing account。OpenAI Codex 仅协助开发，不随软件分发；本软件不是 OpenAI 官方产品。' },
    guide: { label: '操作指引 · {{current}}/{{total}}', importTitle: '导入账号', importDescription: '选择“导入文件夹”可递归读取整个目录；旁边的“导入文件”支持单个或多个 JSON。大量文件会自动分批处理。', searchTitle: '查找与筛选', searchDescription: '可以搜索邮箱、账号 ID 或格式；下方筛选栏可快速查看待验证、在线正常、凭据失效和需要处理的账号。', validateTitle: '开始在线验证', validateDescription: '请先开启国外 IP 或代理。点击后软件会检测当前出口 IP，确认不是中国大陆出口才允许发送实际验证请求。', resultsTitle: '查看结果与额度', resultsDescription: '列表显示在线状态、Codex 5 小时额度和周额度。点击任意账号，可以在详情页查看完整结论、额度与重置时间。', cleanupTitle: '删除凭据失效账号', cleanupDescription: '检测完成后可删除返回 401 的凭据失效账号。限流、无权限、网络失败和未验证账号不会被误删。', exportTitle: '导出剩余账号', exportDescription: '完成检测和清理后，导出除凭据失效以外的所有账号，生成可再次导入的 sub2api JSON。' },
    notices: { importComplete: '{{source}}完成：{{files}} 个文件，解析 {{accounts}} 个账号', issues: '，{{count}} 个问题', import: '导入', fileImport: '文件导入', folderImport: '文件夹“{{name}}”导入', noJson: '所选文件夹内没有 JSON 文件', folderFailed: '文件夹导入失败：{{message}}', folderFailedGeneric: '文件夹导入失败', jsonOnly: '仅支持 JSON 文件', tooLarge: '文件超过 10 MB', checkingIp: '正在检测当前出口 IP...', ipCheckFailed: '出口 IP 检测失败，已阻止在线验证', noAccounts: '没有需要验证的账号', validationServiceFailed: '本地验证服务连接失败', tokenRefreshed: '访问令牌已刷新', validationComplete: '在线验证完成：本批次 {{count}} 个凭据', quotaRefreshed: '额度已刷新', quotaUnavailable: '未获取到额度：{{detail}}', quotaFailed: '额度刷新失败，请检查国外代理连接', exported: '已导出 {{count}} 个剩余账号', deleted: '已删除 {{count}} 个凭据失效账号', notValidated: '未验证', drop: '释放以导入 JSON' },
  } },
  en: { translation: {
    brand: { subtitle: 'Account health and Codex quota checks', version: 'v0.8' },
    header: { guide: 'Guide', openSource: 'Open source', privacy: 'Credentials stay in this process', desktop: 'Desktop', mobile: 'Mobile', preview: 'Browser preview', switchLanguage: '切换到中文' },
    splash: { subtitle: 'Account health and Codex quota checks', loading: 'Starting the secure test environment' },
    metrics: { label: 'Account validation metrics', rate: 'Alive rate', verifiedRatio: '{{alive}} / {{tested}} verified', verified: 'Verified', verifiedHint: 'Real requests returned results', pending: 'Pending', invalid: 'Invalid', limited: 'Rate limited', total: 'Total' },
    actions: { importFolder: 'Import folder', importFiles: 'Import files', pasteJson: 'Paste JSON', validate: 'Validate', deleteInvalid: 'Delete invalid', exportRemaining: 'Export remaining', clear: 'Clear', close: 'Close', cancel: 'Cancel', refreshQuota: 'Refresh quota', previous: 'Previous', next: 'Next', finish: 'Finish', exitGuide: 'Exit guide', retryIp: 'Check IP again', startValidation: 'Start validation', confirmDelete: 'Delete', parseImport: 'Parse and import', understood: 'Got it' },
    mobile: { accounts: 'Accounts', details: 'Details' },
    search: { placeholder: 'Search email, account ID, or format', clear: 'Clear search' },
    filters: { all: 'All', pending: 'Pending', alive: 'Alive', invalid: 'Invalid', limited: 'Rate limited', attention: 'Needs attention', count: '{{count}} accounts' },
    table: { account: 'Account', source: 'Source', status: 'Status', quota: 'Codex quota', checkedAt: 'Checked', details: 'Details', noResults: 'No matching accounts', pagination: 'Account pagination', pageSummary: 'Showing {{start}}-{{end}} of {{count}}', page: 'Page {{page}} / {{total}}', previousPage: 'Previous page', nextPage: 'Next page' },
    empty: { title: 'Waiting for account data', details: 'Select an account to view details' },
    status: { untested: 'Untested', unsupported: 'Pending', checking: 'Checking', alive: 'Alive', unauthorized: 'Invalid credential', forbidden: 'Forbidden', rate_limited: 'Rate limited', server_error: 'Service error', network_error: 'Network error' },
    formats: { oauth: 'Generic OAuth' },
    quota: { fiveHours: '5 hours', weekly: 'Weekly', days: '{{count}} days', hours: '{{count}} hours', minutes: '{{count}} min', short: 'Short', long: 'Long', shortQuota: 'Short window', longQuota: 'Long window', resetUnknown: 'Reset time unknown', resetMinutes: 'Resets in {{count}} min', resetHours: 'Resets in {{hours}}h {{minutes}}m', resetDays: 'Resets in {{days}}d {{hours}}h', afterValidation: 'Shown after validation', empty: 'Validate online to show 5-hour and weekly quota', remaining: '{{percent}}% remaining', title: 'Codex quota', subtitle: 'Short and long subscription usage windows' },
    details: { title: 'Account details', conclusion: 'Result', notValidated: 'Online validation has not run', credentials: 'Credential details', credential: 'Credential', fingerprint: 'Fingerprint', refreshToken: 'Refresh Token', exists: 'Present', missing: 'Missing', plan: 'Plan', unknown: 'Unknown', checkedAt: 'Checked', sourceFile: 'Source file', deleteAccount: 'Delete account', apiSupported: 'Official API validation supported', codexSupported: 'Real Codex upstream validation supported', apiHint: 'The native network layer sends the check and never returns credentials.', codexHint: 'Sends a minimal model request and classifies the real HTTP response.' },
    paste: { eyebrow: 'Local parser', title: 'Paste account JSON' },
    validation: { eyebrow: 'Real request', title: 'Validate accounts', foreignIp: 'A non-mainland-China IP / proxy is required', foreignIpHint: 'Validation and IP checks use the device native network. Mainland China exits and failed checks are blocked.', ipConfirmed: 'Foreign IP confirmed', checkingIp: 'Checking exit IP', networkBlocked: 'Network cannot validate', available: '{{count}} accounts can be validated', hint: 'OAuth sends a minimal Codex request and reads 5-hour/weekly quota; API keys request the model list.', scope: 'Validation scope', batch: 'Next 25', all: 'All pending accounts' },
    cleanup: { eyebrow: 'Cleanup', title: 'Delete invalid credentials', count: '{{count}} accounts will be deleted', hint: 'Only credentials that returned HTTP 401 are deleted. Rate limits, forbidden, network failures, and untested accounts are kept.' },
    openSource: { eyebrow: 'Author and licenses', title: 'Open-source notice', maintainer: 'Author and maintainer: 豫晨', collaboration: '豫晨 × OpenAI Codex collaboration', dependencies: 'Core open-source dependencies', dependenciesHint: 'Primary runtime, UI, and build projects', references: 'Referenced and compatible projects', referencesHint: 'Used for account-state research and import compatibility', codexRef: 'Official quota-window and rate-limit field reference', antigravityRef: 'Account-state classification reference', converterRef: 'Account JSON compatibility reference', sub2apiRef: 'sub2api schema and probe behavior reference', footnote: 'Referenced source code is not bundled with Online testing account. OpenAI Codex assisted development and is not distributed with the app. This is not an official OpenAI product.' },
    guide: { label: 'Guide · {{current}}/{{total}}', importTitle: 'Import accounts', importDescription: 'Import a folder recursively on desktop, or choose one or more JSON files. Large imports are processed in batches.', searchTitle: 'Search and filter', searchDescription: 'Search by email, account ID, or format. Filters show pending, alive, invalid, and attention states.', validateTitle: 'Validate online', validateDescription: 'Enable a foreign IP or proxy first. The app checks the exit IP and blocks mainland China before real validation.', resultsTitle: 'Review results and quota', resultsDescription: 'The list shows account state plus Codex 5-hour and weekly quota. Select an account for the complete result and reset time.', cleanupTitle: 'Delete invalid credentials', cleanupDescription: 'Remove only credentials that returned HTTP 401. Other failure classes remain untouched.', exportTitle: 'Export remaining accounts', exportDescription: 'Export every account except invalid credentials as re-importable sub2api JSON.' },
    notices: { importComplete: '{{source}} complete: {{files}} files, {{accounts}} accounts parsed', issues: ', {{count}} issues', import: 'Import', fileImport: 'File import', folderImport: 'Folder “{{name}}” import', noJson: 'No JSON files found in the selected folder', folderFailed: 'Folder import failed: {{message}}', folderFailedGeneric: 'Folder import failed', jsonOnly: 'Only JSON files are supported', tooLarge: 'File exceeds 10 MB', checkingIp: 'Checking the current exit IP...', ipCheckFailed: 'Exit IP check failed; validation is blocked', noAccounts: 'No accounts need validation', validationServiceFailed: 'Local validation service is unavailable', tokenRefreshed: 'Access token refreshed', validationComplete: 'Validation complete: {{count}} credentials', quotaRefreshed: 'Quota refreshed', quotaUnavailable: 'Quota unavailable: {{detail}}', quotaFailed: 'Quota refresh failed; check the foreign proxy', exported: 'Exported {{count}} remaining accounts', deleted: 'Deleted {{count}} invalid accounts', notValidated: 'Untested', drop: 'Drop to import JSON' },
  } },
} as const;

const savedLanguage = localStorage.getItem('ota-language');
const initialLanguage = savedLanguage === 'en' || savedLanguage === 'zh'
  ? savedLanguage
  : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'zh',
  supportedLngs: ['zh', 'en'],
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (language) => {
  localStorage.setItem('ota-language', language);
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
});

export default i18n;
