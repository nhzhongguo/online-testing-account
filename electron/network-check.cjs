const NETWORK_CHECK_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'Online-testing-account/0.8.3' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createResult(ip, countryCode, provider) {
  const normalizedCountry = String(countryCode || '').trim().toUpperCase();
  if (!normalizedCountry) throw new Error('IP 服务未返回国家代码');
  const countryKnown = /^[A-Z]{2}$/.test(normalizedCountry) && normalizedCountry !== 'XX';
  return {
    allowed: countryKnown && normalizedCountry !== 'CN',
    ip: String(ip || '').trim(),
    countryCode: normalizedCountry,
    provider,
    detail: !countryKnown
      ? '无法确认出口 IP 所在国家；仍可继续，测试外国模型时建议开启代理'
      : normalizedCountry === 'CN'
        ? '当前为中国大陆出口 IP；仍可继续，但外国模型可能需要代理'
        : `当前出口位于 ${normalizedCountry}，可以进行在线验证`,
  };
}

async function checkWithCloudflare() {
  const response = await fetchWithTimeout('https://www.cloudflare.com/cdn-cgi/trace');
  if (!response.ok) throw new Error(`Cloudflare HTTP ${response.status}`);
  const entries = Object.fromEntries((await response.text())
    .split('\n')
    .map((line) => line.trim().split('='))
    .filter((parts) => parts.length === 2));
  return createResult(entries.ip, entries.loc, 'Cloudflare');
}

async function checkWithCountryIs() {
  const response = await fetchWithTimeout('https://api.country.is/');
  if (!response.ok) throw new Error(`country.is HTTP ${response.status}`);
  const data = await response.json();
  return createResult(data.ip, data.country, 'country.is');
}

async function checkNetworkRegion() {
  try {
    return await checkWithCloudflare();
  } catch {
    try {
      return await checkWithCountryIs();
    } catch {
      return {
        allowed: false,
        detail: '无法检测当前出口 IP；仍可继续，测试外国模型时建议开启代理',
      };
    }
  }
}

module.exports = { checkNetworkRegion };
