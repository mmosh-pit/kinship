# build docker image
gcloud builds submit  --tag us-central1-docker.pkg.dev/hellbenders-public-c095b/solana-tool/docker-image . --project hellbenders-public-c095b

gcloud compute instance-groups managed rolling-action start-update solana-tool-mig --version template=solana-template --zone=us-central1-c --type=proactive --project hellbenders-public-c095b
