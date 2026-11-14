FROM python:3.12-slim
RUN pip install --no-cache-dir openpyxl
WORKDIR /app
COPY tools/importar_excel.py .
ENV DATA_DIR=/data EXCEL_DIR=/data/entrada
RUN mkdir -p /data && chown 1000:1000 /data
CMD ["python", "importar_excel.py"]
