import * as fs from 'fs';
import * as yaml from 'js-yaml';

import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';
import * as k8stypes from '@pulumi/kubernetes/types/input';

/**
 * StandardApp is an application to serve an API.
 */
export class StandardApp extends pulumi.ComponentResource {
  private readonly hostname: string;
  private readonly service: k8s.core.v1.Service;

  /**
   * Creates a new StandardApp to serve an API.
   *
   * @param name Service name
   * @param hostname Hostname of the service
   * @param alias Alias name to servie an API
   * @param args Kubernetes Deployment arguments
   * @param provider Kubernetes Provider
   * @param certSecretKey Certificate's secret key name
   * @param opts Options
   */
  constructor(
    name: string,
    hostname: string,
    alias: string,
    args: k8stypes.apps.v1.Deployment,
    provider: k8s.Provider,
    certSecretKey: pulumi.Input<string>,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('app:deployment:StandardApp', name, {}, opts);

    const k8sOpts = {
      provider: provider,
      parent: this,
    };

    // config map
    const config = yaml.safeLoad(fs.readFileSync('app/sidecar.yaml').toString());
    // overwrite the hostname
    config.static_resources.listeners[0].filter_chains[0].filters[0].config.route_config.virtual_hosts[0].domains = [
      hostname,
      alias,
    ];
    // CA certificate for client certificate validation
    const caCert = fs.readFileSync('origin-pull-ca.pem');

    new k8s.core.v1.ConfigMap(
      `configmap/${name}`,
      {
        metadata: {
          name: 'sidecar',
        },
        data: {
          'sidecar.yaml': yaml.safeDump(config),
          'cloudflare-ca.pem': caCert.toString(),
        },
      },
      k8sOpts
    );

    // deployment
    args.metadata = {
      name: name,
    };
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    // update spec
    args.spec = pulumi.all([args.spec!, certSecretKey]).apply(([spec, key]) => {
      const appLabels = { app: name };
      const template = spec.template!;
      const pod = template.spec!;

      // Inject selector spec to expose
      spec.selector = { matchLabels: appLabels };
      template.metadata = { labels: appLabels };

      // Add an Envoy sidecar container.
      pod.containers = pod.containers || [];
      pod.containers.push({
        name: 'envoy',
        image: 'envoyproxy/envoy:v1.12.2',
        command: ['/usr/local/bin/envoy'],
        args: ['--config-path /etc/envoy/sidecar.yaml', '--mode serve', '-l debug'],
        ports: [{ containerPort: 443, protocol: 'TCP' }],
        resources: {
          limits: { cpu: '200m', memory: '128Mi' },
          requests: { cpu: '100m', memory: '64Mi' },
        },
        volumeMounts: [
          { name: 'envoy-conf', mountPath: '/etc/envoy' },
          { name: 'cert', mountPath: '/var/run/certs' },
        ],
      });

      // Add an associated Volume for Envoy's config, mounted as a ConfigMap.
      pod.volumes = pod.volumes || [];
      pod.volumes.push({
        name: 'envoy-conf',
        configMap: { name: 'sidecar' },
      });
      pod.volumes.push({
        name: 'cert',
        secret: { secretName: key },
      });

      return spec;
    });
    const deployment = new k8s.apps.v1.Deployment(`deployment/${name}`, args, k8sOpts);
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    // service
    this.service = new k8s.core.v1.Service(
      `service/${name}`,
      {
        metadata: {
          name: name,
        },
        spec: {
          type: 'LoadBalancer',
          ports: [{ name: 'envoy', port: 443 }],
          selector: deployment.spec.selector.matchLabels,
        },
      },
      k8sOpts
    );

    this.hostname = hostname;
  }

  /**
   * Returns external IP address of this service.
   *
   * @returns External IP
   **/
  public externalIP(): pulumi.Output<string> {
    return this.service.status.apply(status => status.loadBalancer.ingress[0].ip);
  }

  /**
   * Returns internal hostname of this service.
   *
   * @returns Hostname
   */
  public getHostname(): string {
    return this.hostname;
  }
}
