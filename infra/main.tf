# Ma Santé Tranquille — demo backend for the Health Surveillance, Pharmacies and Appointments APIs.
# One Lambda behind an API Gateway HTTP API. Tear down with ./teardown.sh.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

variable "prefix" {
  description = "Prefix for every resource name (hackathon labelling rule)."
  type        = string
  default     = "mst"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "owner" {
  type    = string
  default = "gary.fougerolle"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      team    = "medecins-sans-tokens"
      project = "ai-hackathon-nov-2026"
      app     = "ma-sante-tranquille"
      owner   = var.owner
      prefix  = var.prefix
    }
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.mjs"
  output_path = "${path.module}/.build/lambda.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.prefix}-ma-sante-tranquille-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.prefix}-ma-sante-tranquille-api"
  retention_in_days = 7
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.prefix}-ma-sante-tranquille-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 128
  timeout          = 5
  depends_on       = [aws_iam_role_policy_attachment.logs, aws_cloudwatch_log_group.lambda]
}

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.prefix}-ma-sante-tranquille-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

output "base_url" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "surveillance_url" {
  value = "${aws_apigatewayv2_api.http.api_endpoint}/surveillance/v1"
}

output "pharmacies_url" {
  value = "${aws_apigatewayv2_api.http.api_endpoint}/pharmacies/v1"
}

output "appointments_url" {
  value = "${aws_apigatewayv2_api.http.api_endpoint}/appointments/v1"
}
