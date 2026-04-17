import { useRef, useState, useEffect } from 'react'
import { Button } from './button'
import { Label } from './label'
import { api } from '../../lib/api'
import { Image as ImageIcon, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'

interface ImageUploadProps {
    value?: string | string[]
    onChange: (url: string | string[]) => void
    label?: string
    disabled?: boolean
    multiple?: boolean
    className?: string
}

export function ImageUpload({ value, onChange, label = 'Imagen', disabled, multiple = false, className }: ImageUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [imageUrls, setImageUrls] = useState<string[]>([])

    // Sync state with props
    useEffect(() => {
        if (Array.isArray(value)) {
            setImageUrls(value)
        } else if (value) {
            setImageUrls([value])
        } else {
            setImageUrls([])
        }
    }, [value])

    // Handle file selection
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        const validFiles: File[] = []
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            if (!file.type.startsWith('image/')) {
                toast.error(`Archivo ${file.name} no es una imagen válida`)
                continue
            }
            if (file.size > 5 * 1024 * 1024) {
                toast.error(`Imagen ${file.name} supera los 5MB`)
                continue
            }
            validFiles.push(file)
        }

        if (validFiles.length > 0) {
            await uploadImages(validFiles)
        }
    }

    const uploadImages = async (files: File[]) => {
        setUploading(true)
        try {
            // Upload parallel
            const promises = files.map(async (file) => {
                const formData = new FormData()
                formData.append('file', file)

                try {
                    const res = await api.post('/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    })
                    return res.data.url
                } catch (err) {
                    console.error("Single file upload failed", err)
                    return null
                }
            })

            const results = await Promise.all(promises)
            const newUrls = results.filter(url => url !== null)

            if (newUrls.length > 0) {
                if (multiple) {
                    const updated = [...imageUrls, ...newUrls]
                    onChange(updated)
                } else {
                    onChange(newUrls[0])
                }
                toast.success(`${newUrls.length} imagen(es) cargada(s)`)
            }

        } catch (error) {
            console.error('Upload Error:', error)
            toast.error('Error al subir imágenes')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleRemove = (urlToRemove: string) => {
        if (multiple) {
            const updated = imageUrls.filter(url => url !== urlToRemove)
            onChange(updated)
        } else {
            onChange('')
        }
    }

    return (
        <div className={cn("space-y-4", className)}>
            <Label>{label}</Label>

            {/* Grid of existing images */}
            {imageUrls.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                    {imageUrls.map((url, index) => (
                        <div key={index} className="relative group rounded-lg overflow-hidden border bg-background aspect-square flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
                            <img
                                src={url}
                                alt={`Image ${index + 1}`}
                                className="h-full w-full object-contain p-1"
                            />
                            {!disabled && (
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        className="h-6 w-6 rounded-full"
                                        onClick={() => handleRemove(url)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Button Area - Show if multiple or if no image selected yet */}
            {(!disabled && (multiple || imageUrls.length === 0)) && (
                <div
                    className={`
                        border-2 border-dashed border-muted-foreground/25 rounded-lg 
                        flex flex-col items-center justify-center p-6 gap-2 
                        transition-all hover:bg-accent/50 cursor-pointer hover:border-primary/50
                        ${uploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {uploading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}

                    <span className="text-sm text-muted-foreground font-medium">
                        {uploading ? 'Subiendo...' : multiple ? 'Click para agregar imágenes' : 'Click para subir imagen'}
                    </span>
                    <p className="text-xs text-muted-foreground/70">
                        Soporta: JPG, PNG, WEBP (Max 5MB)
                    </p>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        multiple={multiple}
                        onChange={handleFileChange}
                        disabled={disabled || uploading}
                    />
                </div>
            )}
        </div>
    )
}
