# UnstructuredDB MCP Server - Google Cloud Run Deployment Guide

This guide will help you deploy the UnstructuredDB MCP Server to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account with billing enabled
2. **Google Cloud CLI**: Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
3. **Docker**: Install [Docker](https://docs.docker.com/get-docker/) (optional, for local testing)

## Step 1: Setup Google Cloud Project

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create YOUR_PROJECT_ID --name="UnstructuredDB MCP Server"

# Set the project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

## Step 2: Deploy to Cloud Run

### Option A: Using the deployment script (Recommended)

```bash
# Make the script executable
chmod +x deploy.sh

# Set your project ID and run deployment
export PROJECT_ID=YOUR_PROJECT_ID
export REGION=us-central1  # or your preferred region
./deploy.sh
```

### Option B: Manual deployment

```bash
# Build and push the Docker image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/unstructureddb-mcp-server .

# Deploy to Cloud Run
gcloud run deploy unstructureddb-mcp-server \
    --image gcr.io/YOUR_PROJECT_ID/unstructureddb-mcp-server \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 10 \
    --timeout 300 \
    --set-env-vars "PORT=8080"
```

## Step 3: Configure Environment Variables

If your application requires environment variables (like API keys), set them in Cloud Run:

```bash
gcloud run services update unstructureddb-mcp-server \
    --region us-central1 \
    --set-env-vars "PINECONE_API_KEY=your_key,PINECONE_INDEX=your_index"
```

## Step 4: Verify Deployment

```bash
# Get the service URL
gcloud run services describe unstructureddb-mcp-server \
    --region us-central1 \
    --format="value(status.url)"

# Test the health endpoint
curl https://YOUR_SERVICE_URL/health

# Test the root endpoint
curl https://YOUR_SERVICE_URL/
```

## Step 5: Continuous Deployment (Optional)

To enable automatic deployments on code changes, you can use Cloud Build triggers:

```bash
# Create a trigger for automatic builds
gcloud builds triggers create github \
    --repo-name=YOUR_REPO_NAME \
    --repo-owner=YOUR_GITHUB_USERNAME \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml
```

## Service Configuration

The deployed service includes:

- **Memory**: 512MB
- **CPU**: 1 vCPU
- **Max Instances**: 2
- **Timeout**: 300 seconds
- **Port**: 8080
- **Authentication**: Public (unauthenticated)

## Monitoring and Logs

```bash
# View logs
gcloud logs tail --service=unstructureddb-mcp-server

# Monitor the service
gcloud run services describe unstructureddb-mcp-server --region us-central1
```

## Troubleshooting

1. **Build fails**: Check that all dependencies are in `requirements.txt`
2. **Service won't start**: Check logs for environment variable issues
3. **Health check fails**: Ensure the `/health` endpoint is working
4. **Memory issues**: Increase memory allocation if needed

## Cost Optimization

- The service scales to zero when not in use
- Consider reducing `max-instances` for cost savings
- Monitor usage in Google Cloud Console 