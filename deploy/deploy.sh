#!/bin/bash

set -e

prog=$(basename "$0")

command_exists () {
  hash "$1" 2>/dev/null || {
    echo >&2 "$prog: command not found: $1"
    exit 1
  }
}

. ./.env-deploy

command_exists docker
command_exists eb
command_exists gsed

tag=$(date +%Y%m%d%H%M%S)
# tag=20170131102529

docker login --username "$DOCKER_USER" --password "$DOCKER_PASS"

docker build --cache-from endfoos/foosilator:latest \
             --tag "endfoos/foosilator:$tag" \
             --tag endfoos/foosilator \
             .

docker push endfoos/foosilator:latest
docker push "endfoos/foosilator:$tag"

# Deploy to AWS Elastic Beanstalk
rm -rf .deploy
mkdir .deploy
cp deploy/Dockerrun.aws.json .deploy
cd .deploy || exit 1
gsed -i "s/<TAG>/$tag/" Dockerrun.aws.json


echo "1" | eb init --region "$EB_REGION" "$EB_APP"
eb use "$EB_ENV"
eb deploy -l "$tag"

exit 0
