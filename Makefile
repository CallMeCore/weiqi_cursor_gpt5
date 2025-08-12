APP=weiqi-cusor-gpt5
REGION=hkg
VOLUME=katago_data
SIZE=10

.PHONY: build deploy volume open ssh

build:
	docker build -t weiqi-gtp:latest .

deploy:
	@flyctl apps create $(APP) || true
	@flyctl volumes create $(VOLUME) --size $(SIZE) --region $(REGION) --app $(APP) || true
	@flyctl deploy --app $(APP)

open:
	@flyctl open --app $(APP)

ssh:
	@flyctl ssh console --app $(APP)



