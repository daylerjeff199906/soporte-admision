FROM python:3.12-slim
RUN pip install --no-cache-dir openpyxl
WORKDIR /app
COPY tools/importar_excel.py .
ENV DATA_DIR=/data EXCEL_DIR=/data/entrada
CMD ["python", "importar_excel.py"]
