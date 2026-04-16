# build docker image
gcloud builds submit  --tag us-central1-docker.pkg.dev/hellbenders-public-c095b/structured-mcp/docker-image . --project hellbenders-public-c095b

gcloud compute instance-groups managed rolling-action start-update structured-mcp-mig --version template=structured-mcp-template --zone=us-central1-c --type=proactive --project hellbenders-public-c095b
