import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { DNSZone } from '../interface';

/**
 * MyDNS controls DNS Zone in Google Cloud DNS.
 */
export class MyDNS extends gcp.dns.ManagedZone implements DNSZone {
  private readonly domain: string;

  /**
   * Creates a new MyDNS instance with creating a new Google Cloud DNS Zone.
   *
   * @param name Resource name
   * @param domainName Domain Name
   * @param opts Pulumi options
   */
  constructor(name: string, domainName: string, opts?: pulumi.CustomResourceOptions) {
    if (!domainName.endsWith('.')) {
      domainName = domainName + '.';
    }
    const args = {
      name: domainName.slice(0, -1).replace(/\./g, '-'),
      dnsName: domainName,
    };
    super(name, args, opts);
    this.domain = domainName;
  }

  /**
   * Returns a list of name servers (NS records) for this Zone.
   *
   * @returns list of name servers (wrapped with pulumi.Output)
   **/
  public getNameservers(): pulumi.Output<string[]> {
    return this.nameServers;
  }

  public getDomain(): string {
    return this.domain;
  }

  /**
   * Adds a new record to this Zone.
   *
   * @param type Record type
   * @param name Record name
   * @param value Record value
   * @param ttl Record TTL
   */
  public addRecord(type: string, name: string, value: pulumi.Input<string>, ttl: number) {
    new gcp.dns.RecordSet(
      `record/${name}/${value}`,
      {
        managedZone: this.name,
        name: `${name}.`,
        rrdatas: [value],
        ttl: ttl,
        type: type,
      },
      { parent: this }
    );
  }
}
