/**
 * Metadata endpoint blocklist (M8). Blocks cloud metadata IPs/hostnames to
 * prevent SSRF via the metadata service (AWS/Azure/GCP 169.254.169.254,
 * metadata.google.internal, link-local 169.254.0.0/16). Pure.
 */

const METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.azure.com",
  "metadata.aws.internal",
]);

export function isMetadataHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (METADATA_HOSTS.has(h)) return true;
  // Link-local IPv4 169.254.0.0/16 covers AWS/Azure/GCP metadata IPs.
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (h === "169.254.169.254") return true;
  return false;
}

export function isMetadataAddress(ip: string): boolean {
  return isMetadataHost(ip);
}
