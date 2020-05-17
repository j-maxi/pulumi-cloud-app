import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as k8s from '@pulumi/kubernetes';

import * as config from '../common/config';
import * as gcputil from './util';
import * as gcpcontainer from './container';

/**
 * PublicCluster is a GKE cluster to host a public API.
 */
export class PublicCluster extends gcp.container.Cluster {
  private readonly zone: string;
  private readonly adminKubeconfig: pulumi.Output<string>;
  private readonly adminK8sOpts: pulumi.ResourceOptions;

  /**
   * Creates a new cluster with a node pool.
   * Cert-Manager is initialized to get ready to issue a certificate.
   *
   * @param name Cluster name
   * @param zone Zone name
   * @param version Cluster version number
   * @param nodeCount Node count
   * @param opts Options
   */
  constructor(
    name: string,
    zone: string,
    version: string,
    nodeCount = 3,
    opts?: pulumi.CustomResourceOptions
  ) {
    const clusterName = name.replace(/\//g, '-'); // slash is not allowed
    const args = {
      name: clusterName,
      location: zone,
      initialNodeCount: 1,
      minMasterVersion: version,
      // Setting an empty username and password explicitly disables basic auth
      masterAuth: {
        username: '',
        password: '',
      },
      loggingService: 'logging.googleapis.com/kubernetes',
      monitoringService: 'monitoring.googleapis.com/kubernetes',
      addonsConfig: {
        httpLoadBalancing: {
          disabled: true,
        },
      },
      removeDefaultNodePool: true, // Remove default node poll
    };
    super(name, args, opts);
    this.zone = zone;

    // create Kubernetes Provider
    this.adminKubeconfig = pulumi
      .all([this.name, this.endpoint, this.masterAuth])
      .apply(([name, endpoint, auth]) => {
        const context = `${gcp.config.project}_${zone}_${name}`;
        return `
clusters:
- cluster:
    certificate-authority-data: ${auth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
      });
    const adminProvider = new k8s.Provider(
      `k8sprovider/gcp/${zone}`,
      {
        kubeconfig: this.adminKubeconfig,
      },
      { parent: this }
    );

    // cluster-admin role is required for GKE to manipulate ClusterRole
    const binding = new k8s.rbac.v1.ClusterRoleBinding(
      'admin-binding-deploy',
      {
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'ClusterRole',
          name: 'cluster-admin',
        },
        subjects: [
          {
            kind: 'User',
            name: gcputil.accountEmail(),
          },
        ],
      },
      { provider: adminProvider, parent: this }
    );
    const pool = this.addNodePool('gcp/cluster/nodepool/default', nodeCount);

    // install cert-manager
    const certManagerConfig = new k8s.yaml.ConfigFile(
      'cert-manager',
      {
        file:
          'https://github.com/jetstack/cert-manager/releases/download/v0.11.1/cert-manager.yaml',
      },
      {
        provider: adminProvider,
        parent: this,
        dependsOn: [binding, pool],
      }
    );

    // initialize k8s resource options for admin
    this.adminK8sOpts = {
      provider: adminProvider,
      parent: this,
      dependsOn: [binding, pool, certManagerConfig],
    };
  }

  private addNodePool(name: string, initialNodeCount: number): gcp.container.NodePool {
    const serviceAccount = new gcp.serviceAccount.Account(
      'serviceAccount/gcpcluster',
      {
        accountId: 'gcpcluster',
        displayName: 'Node Pool GCP Cluster Service Account',
      },
      { parent: this }
    );
    gcputil.bindToRole('iamRole/gcpcluster/logging', serviceAccount, 'roles/logging.logWriter');
    gcputil.bindToRole('iamRole/gcpcluster/monitoring', serviceAccount, 'roles/monitoring.editor');

    const poolName = name.replace(/\//g, '-');
    return new gcp.container.NodePool(
      name,
      {
        name: poolName,
        location: this.location,
        cluster: this.name,
        initialNodeCount: initialNodeCount,
        nodeConfig: {
          machineType: 'n1-standard-1',
          serviceAccount: serviceAccount.email,
        },
        management: {
          autoRepair: true,
          autoUpgrade: true,
        },
      },
      { parent: this }
    );
  }

  /**
   * Returns a new container group to manage containers
   *
   * @param k8sNamespace Namespace name
   * @param domain Internal domain name
   * @returns a new container group created for the given Namespace
   */
  public newContainers(k8sNamespace: string, domain: string): gcpcontainer.MyContainers {
    // create a namespace to host containers
    const name = `containers/${k8sNamespace}`;
    const ns = new k8s.core.v1.Namespace(
      `namespace/${k8sNamespace}`,
      {
        metadata: {
          name: k8sNamespace,
        },
      },
      this.adminK8sOpts
    );

    // for now, we pass admin config, but we should use a different one to remove admin privilege
    const childProvider = new k8s.Provider(
      `k8sprovider/gcp/${this.zone}/${k8sNamespace}`,
      {
        kubeconfig: this.adminKubeconfig,
        namespace: ns.metadata.apply(meta => meta.name),
      },
      { parent: ns }
    );

    // create a container group with wildcared certificate
    const containers = new gcpcontainer.MyContainers(name, childProvider, {
      parent: ns,
    });
    containers.initCertificate(domain, config.letsEncryptEmail);

    return containers;
  }
}
