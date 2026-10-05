// Catálogo formal de componentes de negocio compartidos (benchmark §7).
// Es metadato legible por máquina: el contrato estable (props, eventos,
// permisos) que los addons consumen. Ver docs/business-components.md.
export interface BusinessComponentSpec {
    /** Nombre exportado desde `@asteby/metacore-runtime-react`. */
    name: string
    /** Prop de datos principal y su tipo. */
    value: string
    /** Eventos (props `on*`) que emite. */
    events: string[]
    /** Capabilities que consulta con `useCan` (formato `<modelo>.<acción>`). */
    permissions: string[]
    /** Módulos donde el benchmark dice que se usa. */
    usedBy: string[]
    /** Utilidades puras exportadas junto al componente. */
    helpers: string[]
}

export const BUSINESS_COMPONENTS: readonly BusinessComponentSpec[] = [
    {
        name: 'CustomerPicker',
        value: 'value: CustomerResult | null',
        events: ['onChange'],
        permissions: ['<model>.create (alta rápida; default Customer → customer.create)'],
        usedBy: ['POS', 'Cotización', 'Pedido', 'Apartado', 'Factura', 'OT', 'RMA', 'Cobranza'],
        helpers: [],
    },
    {
        name: 'ProductPicker',
        value: '(sin estado: search + onSelect)',
        events: ['onSelect'],
        permissions: [],
        usedBy: ['POS', 'Cotización', 'Pedido', 'OC', 'Recepción', 'Traspaso', 'Ajuste', 'OT'],
        helpers: ['parseProductQuery', 'parseTireSize', 'availableStock', 'productToLine'],
    },
    {
        name: 'DocumentLinesGrid',
        value: 'value: LineItem[] (LineItemsEditor es el mismo componente)',
        events: ['onChange', 'onValidate', 'onRequestProduct'],
        permissions: ['editPermission (prop, opcional)'],
        usedBy: ['Cotización', 'Pedido', 'Factura', 'OC', 'Recepción', 'OT', 'RMA', 'NC', 'Devolución'],
        helpers: [
            'makeLine',
            'computeLine',
            'computeTotals',
            'taxBreakdown',
            'validateLineItems',
            'serializeLineItems',
            'parseLineItems',
            'priceFromProduct',
            'applyProductToLine',
            'addProductLine',
            'lineGridKeyCommand',
            'createCatalogProductSearch',
            'catalogRecordToProduct',
        ],
    },
    {
        name: 'PaymentCapture',
        value: 'value: PaymentTender[]',
        events: ['onChange', 'onSubmit'],
        permissions: ['submitPermission (prop, opcional)'],
        usedBy: ['POS/Caja', 'Apartado', 'Cobranza', 'Factura (Registrar pago)', 'OT'],
        helpers: ['newTender', 'summarizePayment', 'validatePayment', 'serializePayment'],
    },
    {
        name: 'RefundDestination',
        value: 'value: RefundAllocation[]',
        events: ['onChange', 'onValidate'],
        permissions: [],
        usedBy: ['ReturnWizard', 'Cancelación de apartado', 'Anticipos'],
        helpers: ['validateRefund', 'singleDestination', 'DEFAULT_REFUND_DESTINATIONS'],
    },
    {
        name: 'ReturnWizard',
        value: 'lines: ReturnableLine[]',
        events: ['onSubmit', 'onCancel'],
        permissions: [],
        usedBy: ['POS', 'Pedido', 'Factura', 'RMA', 'OT'],
        helpers: ['computeReturnTotals', 'validateReturnChoices', 'creditNoteRelation', 'returnSteps', 'serializeReturn'],
    },
    {
        name: 'InspectionChecklist',
        value: 'points: InspectionPoint[] (+ header: InspectionHeader)',
        events: ['onChange', 'onHeaderChange', 'onUpload', 'onValidate', 'onAddToBudget'],
        permissions: [],
        usedBy: ['Recepción de vehículo', 'OT', 'Alineación', 'Garantía'],
        helpers: [
            'makeInspectionPoint',
            'treadStatus',
            'worstStatus',
            'summarizeInspection',
            'validateInspection',
            'serializeInspectionPoints',
            'parseInspectionPoints',
            'recommendationsToLines',
        ],
    },
    {
        name: 'VehiclePicker',
        value: 'value: VehicleResult | null',
        events: ['onChange'],
        permissions: ['<model>.create (alta rápida; default Vehicle → vehicle.create)'],
        usedBy: ['POS', 'Recepción de vehículo', 'OT', 'Cotización', 'Pedido'],
        helpers: ['describeVehicle'],
    },
    {
        name: 'RelateDocuments',
        value: 'value: RelatedDocument[] (related_document_id + relation_type)',
        events: ['onChange'],
        permissions: [],
        usedBy: ['Nota de crédito', 'Devolución', 'Sustitución de CFDI', 'REP'],
        helpers: ['serializeRelatedDocuments'],
    },
    {
        name: 'PrintSendDialog',
        value: 'document: PrintableDocument (+ open)',
        events: ['onSend', 'onPrint', 'onOpenChange'],
        permissions: [],
        usedBy: ['Cotización', 'Factura', 'Nota de crédito', 'Pedido', 'OC'],
        helpers: [],
    },
] as const
