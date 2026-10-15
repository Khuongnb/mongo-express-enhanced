# Multi-arch build of the enhanced image, used by .github/workflows/docker-release.yml.
# Builds upstream's own, unmodified Dockerfile first and layers Dockerfile.enhanced on top of it,
# the same two steps as the manual recipe in Dockerfile.enhanced's header.
#
# Local, single-arch try-out (needs buildx):
#   docker buildx bake --set '*.platform=linux/arm64' --load

variable "TAGS" {
  type    = list(string)
  default = ["khuongnb/mongo-express-enhanced:dev"]
}

variable "VERSION" {
  default = "dev"
}

variable "REVISION" {
  default = ""
}

group "default" {
  targets = ["enhanced"]
}

target "upstream" {
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "enhanced" {
  dockerfile = "Dockerfile.enhanced"
  platforms  = ["linux/amd64", "linux/arm64"]
  # Dockerfile.enhanced's BASE_IMAGE defaults to this name, so FROM resolves to the target above.
  contexts = {
    mongo-express-upstream = "target:upstream"
  }
  tags = TAGS
  labels = {
    "org.opencontainers.image.title"    = "mongo-express-enhanced"
    "org.opencontainers.image.source"   = "https://github.com/Khuongnb/mongo-express-enhanced"
    "org.opencontainers.image.licenses" = "MIT"
    "org.opencontainers.image.version"  = VERSION
    "org.opencontainers.image.revision" = REVISION
  }
}
