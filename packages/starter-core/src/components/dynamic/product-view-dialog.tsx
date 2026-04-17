import { useQuery } from '@tanstack/react-query'
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
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getImageUrl } from '@/lib/utils'

interface ProductViewDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    productId: string | null
}

export function ProductViewDialog({
    open,
    onOpenChange,
    productId,
}: ProductViewDialogProps) {
    // Fetch Product Details
    const { data: product, isLoading } = useQuery({
        queryKey: ['product-details', productId],
        queryFn: async () => {
            if (!productId) return null
            const res = await api.get(`/data/products/me/${productId}`)
            return res.data.success ? res.data.data : null
        },
        enabled: !!productId && open,
    })

    // Fetch Category Details to know labels for custom fields
    const categoryId = product?.category_id
    const { data: categoryDetails } = useQuery({
        queryKey: ['category-details-view', categoryId],
        queryFn: async () => {
            if (!categoryId) return null
            const res = await api.get(`/data/categories/me/${categoryId}`)
            return res.data.success ? res.data.data : null
        },
        enabled: !!categoryId,
    })

    if (!open) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <DialogTitle>Detalles del Producto</DialogTitle>
                    <DialogDescription>
                        Información completa del producto registrado.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pb-10 min-h-0 space-y-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center p-8">
                            <span className="text-muted-foreground">Cargando información...</span>
                        </div>
                    ) : product ? (
                        <>
                            {/* Header Info */}
                            <div className="flex gap-4">
                                <div className="h-24 w-24 rounded-lg bg-muted flex-shrink-0 overflow-hidden border flex items-center justify-center">
                                    {(() => {
                                        const displayImage = product.image || (product.media?.find((m: any) => m.type === 'image')?.url)
                                        return displayImage ? (
                                            <img src={getImageUrl(displayImage)} alt={product.name} className="h-full w-full object-contain" />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                                                No img
                                            </div>
                                        )
                                    })()}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-semibold text-xl">{product.name}</h3>
                                    <div className="flex gap-2 text-sm text-muted-foreground">
                                        <Badge variant="secondary">{product?.category?.name || 'Sin categoría'}</Badge>
                                        {product?.brand?.name && <Badge variant="outline">{product.brand.name}</Badge>}
                                    </div>
                                    <p className="text-2xl font-bold mt-2">${parseFloat(product.base_price).toFixed(2)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Subcategoría</Label>
                                    <div className="font-medium">{product?.sub_category?.name || '-'}</div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">ID del Sistema</Label>
                                    <div className="font-mono text-xs">{product.id}</div>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-1">
                                <Label className="text-muted-foreground">Descripción</Label>
                                <div className="p-3 bg-muted/20 rounded-md text-sm whitespace-pre-wrap">
                                    {product.description || <span className="text-muted-foreground italic">Sin descripción</span>}
                                </div>
                            </div>

                            {/* Features */}
                            <div className="space-y-1">
                                <Label className="text-muted-foreground">Características</Label>
                                <div className="p-3 bg-muted/20 rounded-md text-sm whitespace-pre-wrap">
                                    {product.features || <span className="text-muted-foreground italic">Sin características registradas</span>}
                                </div>
                            </div>

                            {/* Dynamic Fields */}
                            {categoryDetails?.detail_types?.length > 0 && (
                                <div className="space-y-3 pt-4 border-t">
                                    <h4 className="font-medium text-sm">Atributos Específicos</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        {categoryDetails.detail_types.map((dt: any) => {
                                            const val = product.detail_values?.find((v: any) => v.detail_type_id === dt.id)
                                            return (
                                                <div key={dt.id} className="space-y-1">
                                                    <Label className="text-muted-foreground text-xs">{dt.name}</Label>
                                                    <div>
                                                        {dt.type === 'color' && val?.value ? (
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-4 w-4 rounded-full border shadow-sm" style={{ backgroundColor: val.value }} />
                                                                <span className="text-sm">{val.value}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm font-medium">{val?.value || '-'}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Multimedia Gallery */}
                            {product.media && product.media.length > 0 && (
                                <div className="space-y-3 pt-4 border-t">
                                    <h4 className="font-medium text-sm">Galería Multimedia</h4>
                                    <div className="grid grid-cols-4 gap-2">
                                        {product.media.map((item: any, i: number) => (
                                            <div key={i} className="aspect-square rounded-md overflow-hidden bg-muted border relative group flex items-center justify-center">
                                                {item.type === 'image' ? (
                                                    <img src={getImageUrl(item.url)} alt={`Media ${i}`} className="h-full w-full object-contain" />
                                                ) : (
                                                    <div className="h-full w-full flex flex-col items-center justify-center p-2 text-center">
                                                        <span className="text-xs font-semibold uppercase">{item.type}</span>
                                                    </div>
                                                )}
                                                <a
                                                    href={item.type === 'image' ? getImageUrl(item.url) : item.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                                                >
                                                    <span className="text-xs">Abrir</span>
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-8 text-neutral-500">
                            No se encontró el producto.
                        </div>
                    )}
                </div>

                <DialogFooter className="p-6 pt-4 border-t bg-background shrink-0 sm:justify-end">
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
