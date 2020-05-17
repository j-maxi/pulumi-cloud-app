import * as pulumi from '@pulumi/pulumi';
import * as cloudflare from '@pulumi/cloudflare';

import { DNSZone } from '../interface';

/**
 * MyCDN controls Cloudflare CDN.
 **/
export class MyCDN extends cloudflare.Zone {
  private readonly domain: string;

  /**
   * Creates a new MyCDN instance with creating a new Cloudflare Zone.
   *
   * @param domainName Domain Name
   * @param opts Pulumi options
   */
  constructor(domainName: string, opts?: pulumi.CustomResourceOptions) {
    const name = `cloudflare/cdn/${domainName}`;
    const args = {
      jumpStart: false,
      paused: false,
      plan: 'free',
      zone: domainName,
    };

    super(name, args, opts);
    this.domain = domainName;

    // apply default settings
    new cloudflare.ZoneSettingsOverride(
      `cloudflare/cdn/${domainName}/setting`,
      {
        zoneId: this.id,
        settings: {
          alwaysUseHttps: 'on',
          minTlsVersion: '1.0',
          ssl: 'strict',
          tlsClientAuth: 'on',
        },
      },
      { parent: this }
    );
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
  public addRecord(type: string, name: string, value: string, ttl: number) {
    new cloudflare.Record(
      `cloudflare/cdn/record/${name}/${value}`,
      {
        zoneId: this.id,
        type: type,
        name: name,
        value: value,
        ttl: ttl,
      },
      { parent: this }
    );
  }

  public addProxy(host: string, alias: string) {
    new cloudflare.Record(
      `cloudflare/cdn/record/${host}/${alias}`,
      {
        zoneId: this.id,
        type: 'CNAME',
        name: host,
        value: alias,
        proxied: true,
      },
      { parent: this }
    );
  }

  /**
   * Adds subdomain to Cloudflare DNS by registering NS record.
   *
   * @param subdomainDNS A DNS zone for the subdomain
   **/
  public addSubdomain(subdomainDNS: DNSZone) {
    subdomainDNS.getNameservers().apply((servers: string[]) => {
      servers.forEach(item => {
        this.addRecord('NS', subdomainDNS.getDomain(), item, 3600);
      });
    });
  }
}
