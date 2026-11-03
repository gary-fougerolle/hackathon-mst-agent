#!/usr/bin/env bash
# Deploy the Ma Santé Tranquille demo APIs. Usage: AWS_PROFILE=<profile> ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
terraform init -input=false
terraform apply -input=false -auto-approve
terraform output
