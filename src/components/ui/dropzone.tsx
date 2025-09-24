"use client"

import { useRef, useState } from "react"
import { UploadCloud } from "lucide-react"

interface DropzoneProps {
  onFileSelected: (file: File) => void
  accept?: string
  label: string
  previewUrl?: string
}

export default function Dropzone({
  onFileSelected,
  accept,
  label,
  previewUrl,
}: DropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState("")

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFileName(e.target.files[0].name)
      onFileSelected(e.target.files[0])
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files?.[0]) {
      setFileName(e.dataTransfer.files[0].name)
      onFileSelected(e.dataTransfer.files[0])
    }
  }

  return (
    <div
      className="border-2 border-dashed border-stone-400 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-stone-100 transition relative"
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {previewUrl ? (
        accept?.includes("image") ? (
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full max-h-48 object-cover rounded mb-2"
          />
        ) : accept?.includes("video") ? (
          <video
            src={previewUrl}
            controls
            className="w-full max-h-48 rounded mb-2"
          />
        ) : null
      ) : (
        <>
          <UploadCloud className="w-10 h-10 text-stone-500 mb-2" />
          <p className="text-stone-700 font-medium">{label}</p>
          <p className="text-xs text-stone-500 mt-1">Click or drag & drop</p>
        </>
      )}
      {fileName && !previewUrl && (
        <p className="text-xs mt-2 text-stone-600 truncate">{fileName}</p>
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </div>
  )
}
