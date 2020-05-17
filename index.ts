import * as config from './common/config';
import * as gcpcluster from './gcp/cluster';
import * as gcpdns from './gcp/dns';
import * as cloudflarecdn from './cloudflare/cdn';

/* Setup DNS */

// Use Cloudflare for CDN
const cdn = new cloudflarecdn.MyCDN(config.domain);

// Use Google Cloud DNS to serve a subdomain for applications running in Google Cloud.
const subdomain = `gcp.internal.${config.domain}`;
const gcpDNS = new gcpdns.MyDNS(`gcp/dns/subdomain`, subdomain);
cdn.addSubdomain(gcpDNS);

/* Setup Kubernetes */

const zone = 'us-west2-b';
const gke = new gcpcluster.PublicCluster(`gcp/cluster/${zone}`, zone, '1.15');

/* Application */

const containers = gke.newContainers('my-namespace', `my-namespace.${subdomain}`);
const host = `nginx.${config.domain}`;
// Add a sample application
const nginxApp = containers.newService('nginx', host, {
  spec: {
    selector: {}, // overwritten by standard deployment model
    replicas: 1,
    template: {
      spec: {
        containers: [
          {
            name: 'nginx',
            image: 'nginx:1.7.9',
            ports: [{ containerPort: 80 }],
          },
        ],
      },
    },
  },
});
nginxApp.externalIP().apply(ip => gcpDNS.addRecord('A', nginxApp.getHostname(), ip, 300));
cdn.addProxy(host, nginxApp.getHostname());

// output
export const appInternalURL = `https://${nginxApp.getHostname()}`;
export const appPublicURL = `https://${host}`;
