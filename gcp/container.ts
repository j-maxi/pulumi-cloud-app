import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as k8s from '@pulumi/kubernetes';
import * as k8stypes from '@pulumi/kubernetes/types/input';

import * as gcputil from './util';
import * as deployment from '../app/deployment';

/**
 * MyContainers controls a container group for a Kubernetes namespace.
 **/
export class MyContainers extends pulumi.ComponentResource {
  private readonly provider: k8s.Provider;
  private domain: string;
  private certSecretKey: pulumi.Output<string>;

  /**
   * Creates a new MyContainers instance.
   *
   * @param name Resource name
   * @param provider Kubernetes provider to use creating resources
   * @param opts Pulumi options
   */
  constructor(name: string, provider: k8s.Provider, opts: pulumi.ComponentResourceOptions) {
    super('gcpjs:container:MyContainers', name, {}, opts);
    this.provider = provider;
  }

  /**
   * Initializes a wildcared certificate used for resources in this namespace.
   *
   * @param domain Domain name
   * @param email Email address for LetsEncrypt
   */
  public initCertificate(domain: string, email: string) {
    this.domain = domain;

    // create service account
    const serviceAccount = new gcp.serviceAccount.Account(
      'account/cert-manager',
      {
        accountId: 'cert-manager',
        displayName: 'My Cert-Manager Service Account',
      },
      { parent: this }
    );
    gcputil.bindToRole('iamRole/cert/dns', serviceAccount, 'roles/dns.admin');

    // create a key
    const certManagerKey = new gcp.serviceAccount.Key(
      'account/cert-manager/key',
      {
        serviceAccountId: serviceAccount.accountId,
        privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
      },
      { parent: serviceAccount }
    );

    // install the key to Secret
    const secret = new k8s.core.v1.Secret(
      'cert/secret',
      {
        metadata: {
          name: 'cert-secret',
        },
        data: certManagerKey.privateKey.apply(key => {
          return {
            'key.json': key,
          };
        }),
      },
      {
        provider: this.provider,
        parent: this,
      }
    );

    // install cert issuer
    new k8s.apiextensions.CustomResource(
      'cert/issuer',
      {
        apiVersion: 'cert-manager.io/v1alpha2',
        kind: 'Issuer',
        metadata: {
          name: 'letsencrypt-issuer',
        },
        spec: {
          acme: {
            server: 'https://acme-v02.api.letsencrypt.org/directory',
            email: email,
            privateKeySecretRef: {
              name: 'letsencrypt-issuer',
            },
            solvers: [
              {
                dns01: {
                  clouddns: {
                    project: gcp.config.project,
                    serviceAccountSecretRef: {
                      name: secret.metadata.apply(meta => meta.name),
                      key: 'key.json',
                    },
                  },
                },
              },
            ],
          },
        },
      },
      {
        provider: this.provider,
        parent: this,
      }
    );

    // install certificate
    const cert = new k8s.apiextensions.CustomResource(
      `cert/whildcard-certificate`,
      {
        apiVersion: 'cert-manager.io/v1alpha2',
        kind: 'Certificate',
        metadata: {
          name: 'wildcard-certificate',
        },
        spec: {
          secretName: 'wildcard-certificate',
          issuerRef: {
            name: 'letsencrypt-issuer',
            kind: 'Issuer',
          },
          dnsNames: [`*.${domain}`],
          acme: {
            config: [
              {
                dns01: { provider: 'clouddns' },
                domains: [`*.${domain}`],
              },
            ],
          },
        },
      },
      {
        provider: this.provider,
        parent: this,
      }
    );
    const certCasted = cert as any; // I don't know what is the better..
    this.certSecretKey = certCasted.spec.secretName;
  }

  /**
   * Creates a new service to serve API.
   *
   * @param name Service name
   * @param host FQDN to serve the API
   * @param args Kubernetes Deployment arguments
   * @returns The created service
   */
  public newService(
    name: string,
    host: string,
    args: k8stypes.apps.v1.Deployment
  ): deployment.StandardApp {
    const internalHost = `${name}.${this.domain}`;
    return new deployment.StandardApp(
      name,
      internalHost,
      host,
      args,
      this.provider,
      this.certSecretKey,
      { parent: this }
    );
  }
}
