/**
 * Interface for a DNS Zone managed by a Cloud provider.
 */
export interface DNSZone {
  getDomain(): string;
  getNameservers(): pulumi.Output<string[]>;
}
