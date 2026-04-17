import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MediaGalleryUpload } from '@/components/dynamic/media-gallery-upload'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface BrandCreateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
}

export function BrandCreateDialog({
    open,
    onOpenChange,
    onSuccess,
}: BrandCreateDialogProps) {
    const { t } = useTranslation()
    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm()
    const [submitting, setSubmitting] = useState(false)

    // Fetch Brand Metadata
    const { data: metadata } = useQuery({
        queryKey: ['metadata-modal-brands'],
        queryFn: async () => {
            const res = await api.get('/metadata/modal/brands')
            return res.data.success ? res.data.data : null
        },
        staleTime: 5 * 60 * 1000,
    })

    // Form Submission
    const onSubmit = async (data: any) => {
        setSubmitting(true)
        try {
            // Format Payload
            const payload: any = {
                name: data.name,
                description: data.description,
                logo: (data.media || []).find((m: any) => m.type === 'image')?.url || '',
            }

            const res = await api.post('/data/brands/me', payload)
            if (res.data.success) {
                toast.success('Marca creada exitosamente')
                onOpenChange(false)
                reset()
                onSuccess?.()
            } else {
                toast.error(res.data.message || t('brands.error_create'))
            }
        } catch (error) {
            console.error(error)
            toast.error(t('brands.error_create'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <DialogTitle>{metadata?.CreateTitle || t('brands.create_title')}</DialogTitle>
                    <DialogDescription>
                        {t('brands.create_description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                    <form id="create-brand-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name">{t('brands.brand_name')} *</Label>
                            <Input id="name" {...register('name', { required: true })} />
                            {errors.name && <span className="text-sm text-red-500">{t('common.error')}</span>}
                        </div>

                        {/* Media Gallery (Logo) */}
                        <div className="space-y-2">
                            <MediaGalleryUpload
                                label={t('brands.brand_logo')}
                                value={watch('media')}
                                onChange={(items) => setValue('media', items)}
                                maxFiles={1}
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description">{t('brands.brand_description')}</Label>
                            <Textarea id="description" {...register('description')} />
                        </div>

                    </form>
                </div>

                <DialogFooter className="p-6 pt-4 border-t bg-background shrink-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {t('common.cancel')}
                    </Button>
                    <Button type="submit" form="create-brand-form" disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('brands.create_title')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
