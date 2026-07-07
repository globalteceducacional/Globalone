import React, { useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { toast } from '../utils/toast';

interface ExcelDownloadButtonProps {
  buildWorkbook: () => XLSX.WorkBook | Promise<XLSX.WorkBook>;
  fileName: string;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function ExcelDownloadButton({
  buildWorkbook,
  fileName,
  label,
  disabled,
  className,
}: ExcelDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;

    try {
      setLoading(true);
      const wb = await buildWorkbook();
      XLSX.writeFile(wb, fileName);
      toast.success('Arquivo Excel gerado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao gerar arquivo Excel:', error);
      toast.error('Erro ao gerar arquivo Excel: ' + (error?.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? 'Gerando...' : label}
    </button>
  );
}

