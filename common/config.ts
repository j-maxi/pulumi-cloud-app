import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config('pulumi-cloud-app');
const domain = config.require('domain');
const letsEncryptEmail = config.require('letsEncryptEmail');

export { domain, letsEncryptEmail };
