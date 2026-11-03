#!/usr/bin/env bash
# Remove every resource created by deploy.sh. Usage: AWS_PROFILE=<profile> ./teardown.sh
set -euo pipefail
cd "$(dirname "$0")"
terraform destroy -input=false -auto-approve
