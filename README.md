# Pulumi Multi Cloud Sample Application

A sample application to program multi cloud infrastructure using Pulumi Cloud.

## Tested Component Version

* Pulumi CLI: v2.1.0

## Scope

This application configures the following components:

* Cloudflare DNS
* Google Cloud DNS (subdomain)
* Google Kubernetes Engine
* Nginx as a sample application
  * Accessible via Cloudflare CDN


## Setup procedure

Install Pulumi CLI and gcloud command and run the following commands, where PROJECT\_ID is your GCP project ID.

```
$ npm install
$ pulumi plugins install

$ pulumi init ${your stack name}

# GCP
$ gcloud --project=${PROJECT_ID} iam service-accounts create pulumi-deploy --display-name="Pulumi Deployment"
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/resourcemanager.projectIamAdmin
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/iam.serviceAccountAdmin
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/iam.serviceAccountKeyAdmin
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/iam.serviceAccountUser
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/container.admin
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/compute.admin
$ gcloud projects add-iam-policy-binding ${PROJECT_ID} --member=serviceAccount:pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com --role=roles/dns.admin
$ gcloud --project=${PROJECT_ID} iam service-accounts keys create key.json --iam-account=pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com
$ 
$ pulumi config set gcp:project $PROJECT_ID
$ cat key.json | pulumi config set --secret gcp:credentials
$ gcloud auth activate-service-account --key-file=key.json
$ gcloud config set account pulumi-deploy@${PROJECT_ID}.iam.gserviceaccount.com
$ rm key.json

# Cloudflare
$ pulumi config set cloudflare:email ${cloudflare account email}
$ pulumi config set --secret cloudflare:api_key # specify Cloudflare API key

# Other params: domain name to serve the sample application, and an email address to use LetsEncrypt.
$ pulumi config set pulumi-cloud-app:domain example.com
$ pulumi config set pulumi-cloud-app:letsEncryptEmail admin@example.com
```

## Run

```
$ pulumi up
```
