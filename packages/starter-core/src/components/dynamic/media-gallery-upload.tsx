import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import {
    Image as ImageIcon,
    FileAudio,
    FileText,
    FileVideo,
    Loader2,
    X,
    Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface MediaItem {
    id?: string
    type: 'image' | 'video' | 'audio' | 'document'
    url: string
    label?: string
    file?: File
}

interface MediaGalleryUploadProps {
    value?: MediaItem[]
    onChange: (items: MediaItem[]) => void
    label?: string
    disabled?: boolean
    className?: string
    maxFiles?: number
}

export function MediaGalleryUpload({ value = [], onChange, label, disabled, className, maxFiles }: MediaGalleryUploadProps) {
    const { t } = useTranslation()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [items, setItems] = useState<MediaItem[]>(value || [])

    useEffect(() => {
        setItems(value || [])
    }, [value])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        if (maxFiles && items.length + files.length > maxFiles) {
            toast.error(t('common.max_files_error', { max: maxFiles }))
            return
        }

        const validFiles: File[] = []
        const newItems: MediaItem[] = []

        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            let type: MediaItem['type'] = 'document'

            if (file.type.startsWith('image/')) type = 'image'
            else if (file.type.startsWith('audio/')) type = 'audio'
            else if (file.type.startsWith('video/')) type = 'video'
            else if (file.type === 'application/pdf') type = 'document'

            if (file.size > 50 * 1024 * 1024) {
                toast.error(t('common.file_size_error', { name: file.name }))
                continue
            }

            validFiles.push(file)
            // Create temporary ID and Blob URL for immediate preview
            const tempId = crypto.randomUUID()
            const blobUrl = URL.createObjectURL(file)

            newItems.push({
                id: tempId, // Use ID to track this item during upload
                type,
                url: blobUrl,
                label: file.name.split('.')[0],
                file: file
            })
        }

        if (validFiles.length > 0) {
            // Add placeholders immediately
            setItems(prev => {
                const next = [...prev, ...newItems]
                onChange(next)
                return next
            })

            // Trigger upload
            await uploadFiles(validFiles, newItems)
        }
    }

    const uploadFiles = async (files: File[], placeholderItems: MediaItem[]) => {
        setUploading(true)

        try {
            // Upload sequentially or parallel - parallel is fine but we update state per file to show progress/results
            await Promise.all(files.map(async (file, index) => {
                const formData = new FormData()
                formData.append('file', file)
                const placeholder = placeholderItems[index]

                try {
                    const res = await api.post('/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    })

                    if (res.data.url) {
                        const realUrl = res.data.url

                        // Update state replacing the specific placeholder
                        setItems(prev => {
                            const next = prev.map(item => {
                                if (item.id === placeholder.id) {
                                    return {
                                        ...item,
                                        url: realUrl,
                                        file: undefined // Clear file object, free memory eventually? 
                                        // Note: we should revoke blob url, but React might still be rendering it for a split second.
                                        // Browser handles cleanup usually on page unload or we can do it explicitly.
                                    }
                                }
                                return item
                            })
                            onChange(next)
                            return next
                        })
                    }
                } catch (err) {
                    console.error(`Failed to upload ${file.name}`, err)
                    toast.error(t('common.upload_error', { name: file.name }))
                    // Can optionally remove the failed item from list
                }
            }))

            toast.success(t('common.files_processed', { count: files.length }))

        } catch (error) {
            console.error('Upload Error:', error)
            toast.error(t('common.general_upload_error'))
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleRemove = (indexToRemove: number) => {
        const updated = items.filter((_, index) => index !== indexToRemove)
        setItems(updated)
        onChange(updated)
    }

    const handleUpdateLabel = (index: number, newLabel: string) => {
        const updated = [...items]
        updated[index].label = newLabel
        setItems(updated)
        onChange(updated)
    }


    const getIconForType = (type: string) => {
        switch (type) {
            case 'audio': return <FileAudio className="h-8 w-8 text-blue-500" />
            case 'video': return <FileVideo className="h-8 w-8 text-purple-500" />
            case 'document': return <FileText className="h-8 w-8 text-orange-500" />
            default: return <ImageIcon className="h-8 w-8 text-muted-foreground" />
        }
    }

    const getSpanishType = (type: string) => {
        switch (type) {
            case 'image': return 'IMAGEN'
            case 'video': return 'VIDEO'
            case 'audio': return 'AUDIO'
            case 'document': return 'DOCUMENTO'
            default: return type.toUpperCase()
        }
    }

    const resolveUrl = (url: string) => {
        if (!url) return ''
        if (url.startsWith('blob:')) return url // Local preview
        if (url.startsWith('http') || url.startsWith('https')) return url

        // Remove /api from base URL if present to get root
        const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, '') || ''
        // Ensure url starts with /
        const cleanPath = url.startsWith('/') ? url : `/${url}`
        return `${baseUrl}${cleanPath}`
    }

    return (
        <div className={cn("space-y-4", className)}>
            {label && <Label>{label}</Label>}

            <div className="space-y-2">
                {items.length > 0 && items.map((item, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 border rounded-lg bg-card hover:bg-accent/5 transition-colors group">
                        {/* Preview */}
                        <div className="h-16 w-16 shrink-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden border">
                            {item.type === 'image' ? (
                                <img
                                    src={resolveUrl(item.url)}
                                    alt={item.label}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://placehold.co/60x60?text=Error'
                                    }}
                                />
                            ) : (
                                getIconForType(item.type)
                            )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border px-1.5 py-0.5 rounded-sm bg-secondary">
                                    {getSpanishType(item.type)}
                                </span>
                                <a
                                    href={resolveUrl(item.url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-500 hover:underline truncate max-w-[200px]"
                                >
                                    {t('common.open_file')}
                                </a>
                            </div>
                            <Input
                                value={item.label || ''}
                                onChange={(e) => handleUpdateLabel(index, e.target.value)}
                                placeholder={t('common.file_description')}
                                className="h-8 text-sm"
                                disabled={disabled}
                            />
                        </div>

                        {/* Actions */}
                        {!disabled && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemove(index)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                ))}
            </div>

            {/* Upload Area */}
            {!disabled && (!maxFiles || items.length < maxFiles) && (
                <div
                    className={`
                        border-2 border-dashed border-muted-foreground/25 rounded-lg 
                        flex flex-col items-center justify-center p-8 gap-3
                        transition-all hover:bg-accent/50 cursor-pointer hover:border-primary/50
                        ${uploading ? 'opacity-50 pointer-events-none' : ''}
                    `}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {uploading ? (
                        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                    ) : (
                        <Upload className="h-10 w-10 text-muted-foreground" />
                    )}

                    <div className="text-center">
                        <span className="text-sm font-medium text-foreground block">
                            {uploading ? t('common.uploading') : t('common.add_files')}
                        </span>
                        <span className="text-xs text-muted-foreground mt-1 block">
                            {maxFiles === 1 ? t('common.upload_file') : t('common.images_audio_video')}
                        </span>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,audio/*,video/*,application/pdf"
                        multiple={maxFiles !== 1}
                        onChange={handleFileChange}
                        disabled={disabled || uploading}
                    />
                </div>
            )}
        </div>
    )
}
