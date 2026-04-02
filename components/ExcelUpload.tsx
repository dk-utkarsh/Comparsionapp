"use client";

import { useCallback, useState } from "react";

interface ExcelUploadProps {
  onUpload: (products: string[]) => void;
  loading?: boolean;
}

export default function ExcelUpload({ onUpload, loading }: ExcelUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.products) {
        onUpload(data.products);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`w-full max-w-[580px] mx-auto border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
        dragOver
          ? "border-teal bg-teal/5"
          : "border-teal-light bg-emerald-50/50 hover:border-teal hover:bg-emerald-50"
      }`}
      onClick={() => document.getElementById("file-input")?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept=".xlsx,.csv,.xls"
        onChange={handleChange}
        className="hidden"
        disabled={loading}
      />
      <div className="text-4xl mb-2">📄</div>
      <h3 className="text-base font-bold text-teal-dark">
        {fileName || "Upload Excel File"}
      </h3>
      <p className="text-sm text-slate-muted mt-1">
        Drag & drop or click to browse (.xlsx, .csv)
      </p>
      <p className="text-xs text-slate-light mt-2">
        Excel should have a column with product names
      </p>
    </div>
  );
}
