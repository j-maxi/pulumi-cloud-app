import * as gcp from '@pulumi/gcp';

/**
 * Binds a role to a service account.
 *
 * @param name Binding name
 * @param serviceAccount GCP service account
 * @param role Role name to bind
 * @returns IAMBinding
 */
export function bindToRole(
  name: string,
  serviceAccount: gcp.serviceAccount.Account,
  role: string
): gcp.projects.IAMMember {
  return new gcp.projects.IAMMember(
    name,
    {
      role: role,
      member: serviceAccount.email.apply(email => `serviceAccount:${email}`),
    },
    { parent: serviceAccount }
  );
}

/**
 * Returns service account's e-mail address using in this stack.
 *
 * @returns email address of this service account
 */
export function accountEmail(): string {
  const creds = JSON.parse(gcp.config.credentials || '');
  return creds.client_email;
}
