module github.com/asteby/metacore-sdk

go 1.24

require (
	github.com/Masterminds/semver/v3 v3.3.0
	github.com/asteby/metacore-kernel v0.1.0
	github.com/google/uuid v1.6.0
	gorm.io/gorm v1.31.1
)

replace github.com/asteby/metacore-kernel => ../metacore-kernel

require (
	github.com/fatih/structtag v1.2.0 // indirect
	github.com/gzuidhof/tygo v0.2.21 // indirect
	github.com/inconshreveable/mousetrap v1.0.0 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/spf13/cobra v1.3.0 // indirect
	github.com/spf13/pflag v1.0.5 // indirect
	golang.org/x/mod v0.17.0 // indirect
	golang.org/x/sync v0.9.0 // indirect
	golang.org/x/text v0.20.0 // indirect
	golang.org/x/tools v0.21.1-0.20240508182429-e35e4ccd0d2d // indirect
	gopkg.in/yaml.v2 v2.4.0 // indirect
)

tool github.com/gzuidhof/tygo
