# Role assumed by GitHub Actions (OIDC, no stored AWS keys) to deploy this stack.
# The account already has the shared token.actions.githubusercontent.com provider:
# it is read here, not managed, so teardown never removes it.

variable "github_repos" {
  description = "Repositories allowed to assume the deploy role."
  type        = list(string)
  default     = ["gary-fougerolle/hackathon-mst-agent", "ecointet/hackathon-mst-agent"]
}

data "aws_caller_identity" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.prefix}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [for r in var.github_repos : "repo:${r}:*"]
        }
      }
    }]
  })
}

locals {
  account = data.aws_caller_identity.current.account_id
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "${var.prefix}-github-deploy"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "TerraformState"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["arn:aws:s3:::mst-ma-sante-tranquille-tfstate-${local.account}", "arn:aws:s3:::mst-ma-sante-tranquille-tfstate-${local.account}/*"]
      },
      {
        Sid      = "Lambda"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = ["arn:aws:lambda:${var.region}:${local.account}:function:${var.prefix}-*"]
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = ["arn:aws:logs:${var.region}:${local.account}:log-group:/aws/lambda/${var.prefix}-*", "arn:aws:logs:${var.region}:${local.account}:log-group:/aws/lambda/${var.prefix}-*:*"]
      },
      {
        Sid      = "LogsDescribe"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups", "logs:ListTagsForResource"]
        Resource = "*"
      },
      {
        Sid      = "ApiGateway"
        Effect   = "Allow"
        Action   = ["apigateway:*"]
        Resource = ["arn:aws:apigateway:${var.region}::/apis", "arn:aws:apigateway:${var.region}::/apis/*", "arn:aws:apigateway:${var.region}::/tags/*"]
      },
      {
        Sid      = "OwnRoles"
        Effect   = "Allow"
        Action   = ["iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:PassRole"]
        Resource = ["arn:aws:iam::${local.account}:role/${var.prefix}-*"]
      },
      {
        Sid      = "ReadOidcProvider"
        Effect   = "Allow"
        Action   = ["iam:GetOpenIDConnectProvider", "iam:ListOpenIDConnectProviders"]
        Resource = "*"
      },
      {
        Sid      = "Identity"
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = "*"
      }
    ]
  })
}

output "github_deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}
