# build docker image
gcloud builds submit  --tag us-central1-docker.pkg.dev/hellbenders-public-c095b/mmosh-ai-rewoo/docker-image . --project hellbenders-public-c095b

gcloud compute instance-groups managed rolling-action start-update mmosh-ai-rewoo-mig --version template=mmosh-ai-rewoo-template --zone=us-central1-c --type=proactive --project hellbenders-public-c095b
