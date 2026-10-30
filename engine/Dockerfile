FROM python:3.12-slim
WORKDIR /app
COPY . /app/engine
RUN pip install --no-cache-dir /app/engine
USER 65534:65534
EXPOSE 8010
CMD ["python", "-m", "jpn_structural.service", "--host", "0.0.0.0", "--port", "8010"]
