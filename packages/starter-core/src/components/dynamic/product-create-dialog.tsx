import { useEffect, useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { MediaGalleryUpload } from '@/components/dynamic/media-gallery-upload'
import { toast } from 'sonner'
import { Loader2, Trash, PlusCircle, Package, ChevronRight, GripVertical } from 'lucide-react'
import { Reorder } from 'framer-motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { useAuthStore } from '@/stores/auth-store'
import { getCurrencySymbol } from '@/lib/currency-utils'

interface ProductCreateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    defaultCategoryId?: string
    onSuccess?: () => void
    productId?: string | null
}

export function ProductCreateDialog({
    open,
    onOpenChange,
    defaultCategoryId,
    onSuccess,
    productId,
}: ProductCreateDialogProps) {
    const { t } = useTranslation()
    const { auth } = useAuthStore()
    const currencySymbol = getCurrencySymbol(auth.user?.currency_code || 'USD')
    const isEdit = !!productId
    const { register, handleSubmit, setValue, watch, reset, control, formState: { errors } } = useForm<any>({
        defaultValues: {
            category_id: '',
            sub_category_id: '',
            brand_id: '',
            name: '',
            description: '',
            features: '',
            base_price: '',
            media: [],
            prices: []
        }
    })

    const { fields, append, remove, replace } = useFieldArray({
        control,
        name: "prices"
    });
    const [submitting, setSubmitting] = useState(false)
    const [activeTab, setActiveTab] = useState('general')

    // Watch category_id to fetch dynamic fields
    const categoryId = watch('category_id')

    // Fetch Product Metadata
    const { data: metadata } = useQuery({
        queryKey: ['metadata-modal-products'],
        queryFn: async () => {
            const res = await api.get('/metadata/modal/products')
            return res.data.success ? res.data.data : null
        },
        staleTime: 5 * 60 * 1000,
    })

    // Fetch Options for Selects (Categories, Brands)
    const { data: categories, isLoading: isLoadingCategories } = useQuery({
        queryKey: ['categories-options-v2'], // v2 to avoid conflicts with previous format
        queryFn: async () => {
            const res = await api.get('/options/products?field=category_id')
            return res.data.success ? res.data.data : []
        },
    })

    const { data: brands, isLoading: isLoadingBrands } = useQuery({
        queryKey: ['brands-options'],
        queryFn: async () => {
            const res = await api.get('/options/products?field=brand_id')
            return res.data.success ? res.data.data : []
        }
    })

    const ruleTypes = [
        { value: 'volume_price', label: 'Precio por Volumen', icon: '📦' },
        { value: 'discount_percent', label: 'Descuento Porcentual (%)', icon: '🏷️' },
        { value: 'discount_fixed', label: `Descuento Fijo (${currencySymbol})`, icon: '💸' },
        { value: 'price_override', label: 'Precio Fijo Especial', icon: '⭐' },
        { value: 'buy_x_get_y', label: 'Compra X lleva Y (BOGO)', icon: '🔄' },
    ]

    // Fetch Product Data if we are editing
    const { data: productData, isLoading: isLoadingProduct } = useQuery({
        queryKey: ['product-details', productId],
        queryFn: async () => {
            if (!productId) return null
            const res = await api.get(`/data/products/me/${productId}`)
            return res.data.success ? res.data.data : null
        },
        enabled: !!productId && open,
    })

    useEffect(() => {
        if (productData && open) {
            const media = productData.media && Array.isArray(productData.media) ? productData.media :
                (productData.image ? [{ type: 'image', url: productData.image }] : []);

            const detailValues: any = {};
            if (productData.detail_values && Array.isArray(productData.detail_values)) {
                productData.detail_values.forEach((dv: any) => {
                    detailValues[`detail_${dv.detail_type_id}`] = dv.value;
                });
            }

            reset({
                ...productData,
                category_id: productData.category_id?.toString() || productData.CategoryID?.toString() || '',
                sub_category_id: productData.sub_category_id?.toString() || productData.SubCategoryID?.toString() || '',
                brand_id: productData.brand_id?.toString() || productData.BrandID?.toString() || '',
                name: productData.name || '',
                description: productData.description || '',
                features: productData.features || '',
                base_price: productData.base_price,
                media,
                prices: productData.prices || [],
                ...detailValues
            });

            if (productData.prices && productData.prices.length > 0) {
                replace(productData.prices.map((p: any, idx: number) => ({
                    ...p,
                    id: p.id || `rule-${Date.now()}-${idx}`
                })))
            } else {
                replace([])
            }
        } else if (!productId && open) {
            reset({
                category_id: defaultCategoryId || '',
                sub_category_id: '',
                brand_id: '',
                name: '',
                description: '',
                features: '',
                base_price: '',
                media: [],
                prices: []
            })
            replace([])
        }
    }, [productData, open, productId, defaultCategoryId, reset, replace])


    // Fetch SubCategories when Category changes
    const { data: subCategories } = useQuery({
        queryKey: ['subcategories', categoryId],
        queryFn: async () => {
            if (!categoryId) return []
            const res = await api.get(`/options/products?field=sub_category_id`, { params: { filter_value: categoryId } })
            return res.data.success ? res.data.data : []
        },
        enabled: !!categoryId
    })


    // Fetch Category Details (Custom Fields)
    const { data: categoryDetails } = useQuery({
        queryKey: ['category-details-form', categoryId],
        queryFn: async () => {
            if (!categoryId) return null
            const res = await api.get(`/data/categories/me/${categoryId}`)
            return res.data.success ? res.data.data : null
        },
        enabled: !!categoryId,
    })

    // Set default category if provided (only in create mode)
    useEffect(() => {
        if (defaultCategoryId && open && !productId) {
            setValue('category_id', defaultCategoryId, { shouldValidate: true })
        }
    }, [defaultCategoryId, open, setValue, productId])


    // Form Submission
    const onSubmit = async (data: any) => {
        console.log("Submitting form data:", data)
        setSubmitting(true)
        try {
            // Format Payload
            const payload: any = {
                name: data.name,
                description: data.description,
                base_price: parseFloat(data.base_price),
                category_id: data.category_id,
                sub_category_id: data.sub_category_id || null, // Optional
                brand_id: data.brand_id || null, // Optional
                image: (data.media || []).find((m: any) => m.type === 'image')?.url || '',
                media: data.media || [],
                features: data.features,
                detail_values: [],
                prices: (data.prices || []).map((p: any, index: number) => ({
                    label: p.label || '',
                    rule_type: p.rule_type,
                    price_value: parseFloat(p.price_value) || 0,
                    discount_value: parseFloat(p.discount_value) || 0,
                    min_quantity: parseInt(p.min_quantity) || 1,
                    buy_quantity: parseInt(p.buy_quantity) || 0,
                    get_quantity: parseInt(p.get_quantity) || 0,
                    priority: index // Automatic priority based on order
                }))
            }

            // Extract custom field values
            if (categoryDetails?.detail_types) {
                payload.detail_values = categoryDetails.detail_types.map((dt: any) => ({
                    detail_type_id: dt.id,
                    value: data[`detail_${dt.id}`] || ''
                })).filter((dv: any) => dv.value !== '')
            }

            let res;
            if (isEdit) {
                res = await api.put(`/data/products/me/${productId}`, payload)
            } else {
                res = await api.post('/data/products/me', payload)
            }

            if (res.data.success) {
                toast.success(isEdit ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente')
                onOpenChange(false)
                if (!isEdit) reset() // Only reset on create, edit keeps state until closed/reopened
                onSuccess?.()
            } else {
                toast.error(res.data.message || (isEdit ? t('products.error_update') : t('products.error_create')))
            }
        } catch (error) {
            console.error(error)
            toast.error(isEdit ? t('products.error_update') : t('products.error_create'))
        } finally {
            setSubmitting(false)
        }
    }

    const onErrors = (errors: any) => {
        console.error("Validation Errors:", errors)
        toast.error("Por favor complete los campos requeridos")

        // Auto-switch to the first tab with errors
        const errorFields = Object.keys(errors)
        if (errorFields.some(field => ['name', 'base_price', 'category_id'].includes(field))) {
            setActiveTab('general')
        } else if (errorFields.some(field => field === 'description' || field === 'features' || field.startsWith('detail_'))) {
            setActiveTab('details')
        } else if (errorFields.some(field => field === 'prices')) {
            setActiveTab('pricing')
        }
    }

    // Helper to check if a tab section has errors
    const hasError = (fields: string[]) => {
        return fields.some(field => errors[field]) ||
            (fields.includes('details') && Object.keys(errors).some(k => k.startsWith('detail_')))
    }

    if (!metadata) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden border bg-background">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-muted p-2 rounded-lg border">
                            <Package className="h-5 w-5 text-foreground/70" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold">
                                {isEdit ? (metadata.EditTitle || t('products.edit_title')) : (metadata.CreateTitle || t('products.create_title'))}
                            </DialogTitle>
                            <DialogDescription className="text-sm">
                                {isEdit ? t('products.edit_description') : t('products.create_description')}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
                    <div className="px-6 border-b bg-muted/20 pb-0">
                        <TabsList className="bg-transparent h-auto p-0 gap-6 w-full justify-start border-none">
                            <TabsTrigger
                                value="general"
                                className={cn(
                                    "h-10 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 font-semibold transition-all hover:text-primary relative",
                                    hasError(['name', 'base_price', 'category_id']) && "text-destructive border-b-destructive data-[state=active]:border-destructive bg-destructive/5"
                                )}
                            >
                                Información General
                            </TabsTrigger>
                            <TabsTrigger
                                value="details"
                                className={cn(
                                    "h-10 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 font-semibold transition-all hover:text-primary relative",
                                    hasError(['description', 'features', 'details']) && "text-destructive border-b-destructive data-[state=active]:border-destructive bg-destructive/5"
                                )}
                            >
                                Detalles y Atributos
                            </TabsTrigger>
                            <TabsTrigger
                                value="pricing"
                                className={cn(
                                    "h-10 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-1 font-semibold transition-all hover:text-primary relative",
                                    hasError(['prices']) && "text-destructive border-b-destructive data-[state=active]:border-destructive bg-destructive/5"
                                )}
                            >
                                Reglas de Precio
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 min-h-0 bg-background">
                        {isLoadingProduct || isLoadingCategories || isLoadingBrands ? (
                            <div className="flex flex-col items-center justify-center h-64 gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">Cargando información...</p>
                            </div>
                        ) : (
                            <form id="create-product-form" onSubmit={handleSubmit(onSubmit, onErrors)}>
                                <TabsContent value="general" className="p-6 m-0 space-y-6 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                        {/* Main Info */}
                                        <div className="md:col-span-12 space-y-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="name" className="text-sm font-medium">
                                                    Nombre del Producto <span className="text-destructive">*</span>
                                                </Label>
                                                <Input
                                                    id="name"
                                                    className={cn(
                                                        "h-10 border rounded focus-visible:ring-0 focus-visible:border-primary",
                                                        errors.name && "border-destructive focus-visible:border-destructive"
                                                    )}
                                                    {...register('name', { required: true })}
                                                    placeholder="Ej. Scurro Black Jacket"
                                                />
                                                {errors.name && <span className="text-xs text-destructive">Este campo es requerido</span>}
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="base_price" className="text-sm font-medium">Precio Base <span className="text-destructive">*</span></Label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol}</span>
                                                        <Input
                                                            id="base_price"
                                                            type="number"
                                                            step="0.01"
                                                            className={cn(
                                                                "h-10 pl-7 border font-medium",
                                                                errors.base_price && "border-destructive focus-visible:border-destructive"
                                                            )}
                                                            {...register('base_price', { required: true, min: 0 })}
                                                        />
                                                    </div>
                                                    {errors.base_price && <span className="text-xs text-destructive">Requerido</span>}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <Label htmlFor="brand_id" className="text-sm font-medium">Marca</Label>
                                                    <Select key={brands?.length || 0} onValueChange={(val) => setValue('brand_id', val, { shouldValidate: true })} value={watch('brand_id')?.toString() || ""}>
                                                        <SelectTrigger className="h-10 border">
                                                            <SelectValue placeholder="Seleccionar..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {brands && brands.length > 0 ? (
                                                                brands.map((brand: any) => (
                                                                    <SelectItem key={brand.value} value={brand.value?.toString()}>{brand.label}</SelectItem>
                                                                ))
                                                            ) : (
                                                                <SelectItem value="none" disabled className="text-muted-foreground italic">
                                                                    Sin marcas registradas
                                                                </SelectItem>
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Hierarchy */}
                                        <div className="md:col-span-12 grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="category_id" className="text-sm font-medium">
                                                    Categoría <span className="text-destructive">*</span>
                                                </Label>
                                                <Select
                                                    key={categories?.length || 0}
                                                    onValueChange={(val) => setValue('category_id', val, { shouldValidate: true })}
                                                    value={watch('category_id')?.toString() || ""}
                                                    disabled={!!defaultCategoryId}
                                                >
                                                    <SelectTrigger className={cn(
                                                        "h-10 border",
                                                        errors.category_id && "border-destructive focus:ring-destructive"
                                                    )}>
                                                        <SelectValue placeholder="Seleccionar..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {categories?.map((cat: any) => (
                                                            <SelectItem key={cat.value} value={cat.value?.toString()}>{cat.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <input type="hidden" {...register('category_id', { required: true })} />
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label htmlFor="sub_category_id" className="text-sm font-medium">Subcategoría</Label>
                                                <Select
                                                    key={subCategories?.length || 0}
                                                    onValueChange={(val) => setValue('sub_category_id', val)}
                                                    value={watch('sub_category_id')?.toString() || ""}
                                                    disabled={!categoryId}
                                                >
                                                    <SelectTrigger className="h-10 border">
                                                        <SelectValue placeholder={!categoryId ? "Seleccion." : "Seleccionar..."} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {subCategories?.map((cat: any) => (
                                                            <SelectItem key={cat.value} value={cat.value?.toString()}>{cat.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Media */}
                                        <div className="md:col-span-12 border rounded-lg p-4 space-y-3">
                                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                Galería Multimedia
                                            </Label>
                                            <MediaGalleryUpload
                                                label=""
                                                value={watch('media')}
                                                onChange={(items) => setValue('media', items)}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="details" className="p-6 m-0 space-y-6 animate-in fade-in duration-200">
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 gap-6">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="description" className="text-sm font-medium">Descripción Comercial</Label>
                                                <Textarea
                                                    id="description"
                                                    className="min-h-[100px] border resize-none"
                                                    {...register('description')}
                                                    placeholder="Describe las ventajas de tu producto..."
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label htmlFor="features" className="text-sm font-medium">Características Técnicas</Label>
                                                <Textarea
                                                    id="features"
                                                    className="min-h-[100px] border resize-none font-sans"
                                                    {...register('features')}
                                                    placeholder="• Característica 1 \n• Característica 2..."
                                                />
                                            </div>
                                        </div>

                                        {categoryDetails?.detail_types?.length > 0 && (
                                            <div className="space-y-4 pt-4 border-t">
                                                <h3 className="font-bold text-xs uppercase text-muted-foreground tracking-wider">
                                                    Atributos de {categoryDetails.name}
                                                </h3>

                                                <div className="grid grid-cols-2 gap-4">
                                                    {categoryDetails.detail_types.map((dt: any) => (
                                                        <div key={dt.id} className="space-y-1.5">
                                                            <Label htmlFor={`detail_${dt.id}`} className="text-xs font-medium">{dt.name}</Label>

                                                            {dt.type === 'select' || dt.type === 'color' ? (
                                                                <Input
                                                                    id={`detail_${dt.id}`}
                                                                    {...register(`detail_${dt.id}`)}
                                                                    type={dt.type === 'color' ? 'color' : 'text'}
                                                                    className={cn(
                                                                        "h-9 border",
                                                                        dt.type === 'color' && 'h-10 w-full p-1 cursor-pointer'
                                                                    )}
                                                                />
                                                            ) : (
                                                                <Input
                                                                    id={`detail_${dt.id}`}
                                                                    {...register(`detail_${dt.id}`)}
                                                                    type={dt.type === 'number' ? 'number' : 'text'}
                                                                    className="h-9 border"
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="pricing" className="p-6 m-0 space-y-6 animate-in fade-in duration-200">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border p-4 rounded-lg bg-muted/5">
                                            <div className="space-y-0.5">
                                                <h3 className="font-bold text-sm">Motor de Pricing</h3>
                                                <p className="text-[11px] text-muted-foreground">Configura reglas dinámicas y descuentos por volumen.</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => append({
                                                    id: `rule-${Date.now()}`,
                                                    rule_type: 'volume_price',
                                                    label: '',
                                                    min_quantity: 1,
                                                    price_value: '',
                                                    discount_value: '',
                                                    buy_quantity: 1,
                                                    get_quantity: 1
                                                })}
                                                className="border-primary text-primary hover:bg-primary/5 h-9"
                                            >
                                                <PlusCircle className="h-4 w-4 mr-2" />
                                                Crear Regla
                                            </Button>
                                        </div>

                                        <Reorder.Group
                                            axis="y"
                                            values={fields}
                                            onReorder={(newOrder) => replace(newOrder)}
                                            className="space-y-3"
                                        >
                                            {fields.map((item: any, index: number) => (
                                                <Reorder.Item
                                                    key={item.id}
                                                    value={item}
                                                    className="p-3 border rounded-lg bg-background relative group/item flex items-start gap-3 shadow-sm"
                                                >
                                                    {/* Drag Handle */}
                                                    <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors pt-2">
                                                        <GripVertical className="h-4 w-4" />
                                                    </div>

                                                    <div className="flex-1 space-y-3">
                                                        {/* Row 1: Strategy & Label */}
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <Label className="text-[9px] uppercase font-bold text-muted-foreground/50 ml-1">Estrategia</Label>
                                                                <Controller
                                                                    control={control}
                                                                    name={`prices.${index}.rule_type`}
                                                                    render={({ field }) => (
                                                                        <Select
                                                                            onValueChange={field.onChange}
                                                                            value={field.value}
                                                                        >
                                                                            <SelectTrigger className="h-8 border bg-background text-xs focus:ring-1 focus:ring-primary/20">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {ruleTypes.map((t: any) => (
                                                                                    <SelectItem key={t.value} value={t.value} className="text-xs">
                                                                                        <span className="mr-2">{t.icon}</span>
                                                                                        {t.label}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    )}
                                                                />
                                                            </div>

                                                            <div className="space-y-1">
                                                                <Label className="text-[9px] uppercase font-bold text-muted-foreground/50 ml-1">Etiqueta</Label>
                                                                <Input
                                                                    {...register(`prices.${index}.label`)}
                                                                    className="h-8 border text-xs focus-visible:ring-1 focus-visible:ring-primary/20"
                                                                    placeholder="Ej. Mayoreo"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Row 2: Values (Compact Grid) */}
                                                        {(() => {
                                                            const currentRuleType = watch(`prices.${index}.rule_type`);
                                                            return (
                                                                <div className="bg-muted/5 p-2 rounded-md border border-dashed flex flex-wrap items-center gap-4">
                                                                    {(currentRuleType !== 'buy_x_get_y') && (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase">Mín:</span>
                                                                            <Input
                                                                                type="number"
                                                                                {...register(`prices.${index}.min_quantity`)}
                                                                                className="h-7 w-16 text-xs border focus-visible:ring-1 focus-visible:ring-primary/20"
                                                                            />
                                                                        </div>
                                                                    )}

                                                                    {(currentRuleType === 'volume_price' || currentRuleType === 'price_override') && (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase">Precio:</span>
                                                                            <div className="relative">
                                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{currencySymbol}</span>
                                                                                <Input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    {...register(`prices.${index}.price_value`)}
                                                                                    className="h-7 w-24 pl-5 text-xs border font-bold text-primary focus-visible:ring-1 focus-visible:ring-primary/20"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {(currentRuleType?.includes('discount')) && (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase">Dcto:</span>
                                                                            <Input
                                                                                type="number"
                                                                                {...register(`prices.${index}.discount_value`)}
                                                                                className="h-7 w-16 text-xs border font-bold text-primary focus-visible:ring-1 focus-visible:ring-primary/20"
                                                                            />
                                                                            <span className="text-[10px] font-bold text-muted-foreground">%</span>
                                                                        </div>
                                                                    )}

                                                                    {(currentRuleType === 'buy_x_get_y') && (
                                                                        <div className="flex flex-wrap items-center gap-4">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase">Compra:</span>
                                                                                <Input
                                                                                    type="number"
                                                                                    {...register(`prices.${index}.buy_quantity`)}
                                                                                    className="h-7 w-14 text-xs border focus-visible:ring-1 focus-visible:ring-primary/20"
                                                                                />
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase">Lleva:</span>
                                                                                <Input
                                                                                    type="number"
                                                                                    {...register(`prices.${index}.get_quantity`)}
                                                                                    className="h-7 w-14 text-xs border focus-visible:ring-1 focus-visible:ring-primary/20"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })()}
                                                    </div>

                                                    {/* Delete Button */}
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive/40 hover:text-destructive hover:bg-destructive/10 shrink-0 mt-1"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash className="h-4 w-4" />
                                                    </Button>
                                                </Reorder.Item>
                                            ))}
                                        </Reorder.Group>
                                        {(watch('prices') || []).length === 0 && (
                                            <div className="flex flex-col items-center justify-center py-10 border border-dashed rounded-lg bg-muted/5 opacity-80">
                                                <p className="text-xs text-muted-foreground italic">No hay ofertas configuradas.</p>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            </form>
                        )}
                    </div>
                </Tabs>

                <DialogFooter className="p-4 border-t shrink-0 gap-3">
                    <Button type="button" variant="ghost" className="h-10 px-6 font-medium" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        form="create-product-form"
                        disabled={submitting}
                        className="h-10 px-8 font-bold"
                    >
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
                        {isEdit ? t('products.save_changes') : t('products.create_title')}
                    </Button>
                </DialogFooter>
            </DialogContent >
        </Dialog >
    )
}
