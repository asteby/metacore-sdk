/**
 * The Mexican region pack as `GET /storefront/region` publishes it: the MX seed of the region_mx addon
 * (manifest.json, models region_identity_documents, region_fiscal_catalogs and region_payment_methods; payload
 * shape of regionspec.BuildPublicDocuments / PublicFiscalID). Test and mock data only: the SDK engine knows no
 * country. Regenerate it from the addon when the seed changes.
 */
import type { IdentityDocumentSpec, RegionFiscalEntry, RegionPaymentMethod } from '../types.js'

export const SEED_MX_CSF: IdentityDocumentSpec = {
  "kind": "MX:csf",
  "country_code": "MX",
  "label": "Constancia de situación fiscal",
  "help": "Es el PDF que te da el SAT con tu RFC, tu nombre o razón social, tu régimen y tu código postal fiscal. Lo leemos en tu dispositivo para llenar tus datos de facturación.",
  "obtain_url": "https://www.sat.gob.mx/portal/public/tramites/constancia-de-situacion-fiscal",
  "accept": [
    "application/pdf"
  ],
  "max_bytes": 5242880,
  "max_pages": 6,
  "engine": "rules@1",
  "rules": {
    "version": 1,
    "normalize": [
      "nbsp",
      "collapse_ws"
    ],
    "labels": [
      "RFC",
      "CURP",
      "Nombre \\(s\\)",
      "Nombre",
      "Primer Apellido",
      "Segundo Apellido",
      "Denominaci[óo]n\\s*/\\s*Raz[óo]n Social",
      "R[ée]gimen de capital",
      "Nombre Comercial",
      "Fecha (?:de )?inicio de operaciones",
      "Fecha de constituci[óo]n",
      "Estatus en el padr[óo]n",
      "Fecha de [úu]ltimo cambio de estado",
      "Datos del domicilio registrado",
      "C[óo]digo Postal",
      "Tipo de Vialidad",
      "Nombre de Vialidad",
      "N[úu]mero Exterior",
      "N[úu]mero Interior",
      "Nombre de la Colonia",
      "Nombre de la Localidad",
      "Nombre del Municipio o Demarcaci[óo]n Territorial",
      "Nombre de la Entidad Federativa",
      "Entre Calle",
      "Y Calle",
      "Actividades Econ[óo]micas",
      "Reg[íi]menes",
      "Obligaciones",
      "Correo Electr[óo]nico"
    ],
    "qr_canonical": "https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3={document_id}_{tax_id}",
    "fields": [
      {
        "key": "tax_id",
        "required": true,
        "strategies": [
          {
            "strategy": "labeled_lines",
            "label": "RFC",
            "upper": true,
            "capture": {
              "pattern": "(?:^|[^A-Z0-9Ñ&])([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})(?:[^A-Z0-9Ñ&]|$)",
              "flags": "i",
              "group": 1
            }
          },
          {
            "strategy": "regex",
            "pattern": "(?:^|[^A-Z0-9Ñ&])([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})(?:[^A-Z0-9Ñ&]|$)",
            "flags": "i",
            "group": 1,
            "upper": true
          },
          {
            "strategy": "qr_param",
            "param": "D3",
            "split": "_",
            "parts": 2,
            "match": "^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$"
          },
          {
            "strategy": "qr_param",
            "scan": "(?:D3)?([0-9]{11})[^A-Z0-9Ñ&]{0,3}([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})(?:[^A-Z0-9]|$)",
            "flags": "i",
            "group": 2
          }
        ]
      },
      {
        "key": "legal_name",
        "required": true,
        "strategies": [
          {
            "strategy": "labeled_lines",
            "label": "Denominaci[óo]n\\s*/\\s*Raz[óo]n Social"
          },
          {
            "strategy": "concat_labeled",
            "labels": [
              "Nombre \\(s\\)",
              "Primer Apellido",
              "Segundo Apellido"
            ],
            "separator": " "
          }
        ]
      },
      {
        "key": "postal_code",
        "required": true,
        "strategies": [
          {
            "strategy": "labeled_lines",
            "label": "C[óo]digo Postal",
            "capture": {
              "pattern": "\\b([0-9]{5})\\b",
              "group": 1
            }
          }
        ]
      },
      {
        "key": "tax_regime",
        "required": true,
        "multiple": true,
        "strategies": [
          {
            "strategy": "catalog_phrases",
            "catalog": "fiscal_regime",
            "start": "Reg[íi]menes\\s*:?",
            "end": "Obligaciones\\s*:"
          }
        ]
      },
      {
        "key": "document_id",
        "strategies": [
          {
            "strategy": "regex",
            "pattern": "id\\s*CIF\\s*:?\\s*([0-9]{6,})",
            "flags": "i",
            "group": 1
          },
          {
            "strategy": "qr_param",
            "param": "D3",
            "split": "_",
            "parts": 2,
            "match": "^[0-9]+$"
          },
          {
            "strategy": "qr_param",
            "scan": "(?:D3)?([0-9]{11})[^A-Z0-9Ñ&]{0,3}([A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3})(?:[^A-Z0-9]|$)",
            "flags": "i",
            "group": 1
          }
        ]
      },
      {
        "key": "issued_on",
        "strategies": [
          {
            "strategy": "date",
            "order": "dmy",
            "pattern": "Fecha\\s+de\\s+Emisi[óo]n\\s*:?[^0-9]*?([0-9]{1,2})\\s+DE\\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\\s+DE\\s+([0-9]{4})",
            "flags": "i",
            "months": [
              "enero",
              "febrero",
              "marzo",
              "abril",
              "mayo",
              "junio",
              "julio",
              "agosto",
              "septiembre",
              "octubre",
              "noviembre",
              "diciembre"
            ]
          }
        ]
      }
    ]
  },
  "verify_kind": "qr_validator",
  "freshness_days": 90,
  "discard_fields": [
    "curp",
    "street",
    "exterior_number",
    "neighborhood",
    "activities"
  ]
} as IdentityDocumentSpec

export const SEED_MX_REGIMES: RegionFiscalEntry[] = [
  {
    "code": "601",
    "label": "General de Ley Personas Morales",
    "person_types": [
      "company"
    ],
    "match_phrases": [
      "general de ley personas morales"
    ]
  },
  {
    "code": "603",
    "label": "Personas Morales con Fines no Lucrativos",
    "person_types": [
      "company"
    ],
    "match_phrases": [
      "fines no lucrativos"
    ]
  },
  {
    "code": "605",
    "label": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "sueldos y salarios"
    ]
  },
  {
    "code": "606",
    "label": "Arrendamiento",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "arrendamiento"
    ]
  },
  {
    "code": "607",
    "label": "Régimen de Enajenación o Adquisición de Bienes",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "enajenacion o adquisicion de bienes"
    ]
  },
  {
    "code": "608",
    "label": "Demás ingresos",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "demas ingresos"
    ]
  },
  {
    "code": "610",
    "label": "Residentes en el Extranjero sin Establecimiento Permanente en México",
    "person_types": [
      "individual",
      "company"
    ],
    "match_phrases": [
      "residentes en el extranjero"
    ]
  },
  {
    "code": "611",
    "label": "Ingresos por Dividendos (socios y accionistas)",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "dividendos"
    ]
  },
  {
    "code": "612",
    "label": "Personas Físicas con Actividades Empresariales y Profesionales",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "actividades empresariales y profesionales"
    ]
  },
  {
    "code": "614",
    "label": "Ingresos por intereses",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "ingresos por intereses"
    ]
  },
  {
    "code": "615",
    "label": "Régimen de los ingresos por obtención de premios",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "premios"
    ]
  },
  {
    "code": "616",
    "label": "Sin obligaciones fiscales",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "sin obligaciones fiscales"
    ]
  },
  {
    "code": "620",
    "label": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
    "person_types": [
      "company"
    ],
    "match_phrases": [
      "sociedades cooperativas de produccion"
    ]
  },
  {
    "code": "621",
    "label": "Incorporación Fiscal",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "incorporacion fiscal"
    ]
  },
  {
    "code": "622",
    "label": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
    "person_types": [
      "company"
    ],
    "match_phrases": [
      "actividades agricolas"
    ]
  },
  {
    "code": "623",
    "label": "Opcional para Grupos de Sociedades",
    "person_types": [
      "company"
    ],
    "match_phrases": [
      "opcional para grupos de sociedades"
    ]
  },
  {
    "code": "624",
    "label": "Coordinados",
    "person_types": [
      "company"
    ],
    "match_phrases": [
      "coordinados"
    ]
  },
  {
    "code": "625",
    "label": "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
    "person_types": [
      "individual"
    ],
    "match_phrases": [
      "plataformas tecnologicas"
    ]
  },
  {
    "code": "626",
    "label": "Régimen Simplificado de Confianza",
    "person_types": [
      "individual",
      "company"
    ],
    "match_phrases": [
      "simplificado de confianza"
    ]
  }
]

export const SEED_MX_INVOICE_USES: RegionFiscalEntry[] = [
  {
    "code": "G01",
    "label": "Adquisición de mercancías",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "G03",
    "label": "Gastos en general",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I01",
    "label": "Construcciones",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I02",
    "label": "Mobiliario y equipo de oficina por inversiones",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I03",
    "label": "Equipo de transporte",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I04",
    "label": "Equipo de cómputo y accesorios",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I05",
    "label": "Dados, troqueles, moldes, matrices y herramental",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I06",
    "label": "Comunicaciones telefónicas",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I07",
    "label": "Comunicaciones satelitales",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "I08",
    "label": "Otra maquinaria y equipo",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "606",
      "612",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  },
  {
    "code": "D01",
    "label": "Honorarios médicos, dentales y gastos hospitalarios",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D02",
    "label": "Gastos médicos por incapacidad o discapacidad",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D03",
    "label": "Gastos funerales",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D04",
    "label": "Donativos",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D05",
    "label": "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D06",
    "label": "Aportaciones voluntarias al SAR",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D07",
    "label": "Primas por seguros de gastos médicos",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D08",
    "label": "Gastos de transportación escolar obligatoria",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D09",
    "label": "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "D10",
    "label": "Pagos por servicios educativos (colegiaturas)",
    "person_types": [
      "individual"
    ],
    "allowed_regimes": [
      "605",
      "606",
      "607",
      "608",
      "611",
      "612",
      "614",
      "615",
      "625"
    ]
  },
  {
    "code": "S01",
    "label": "Sin efectos fiscales",
    "person_types": [
      "individual",
      "company"
    ],
    "allowed_regimes": [
      "601",
      "603",
      "605",
      "606",
      "607",
      "608",
      "610",
      "611",
      "612",
      "614",
      "615",
      "616",
      "620",
      "621",
      "622",
      "623",
      "624",
      "625",
      "626"
    ]
  }
]

export const SEED_MX_PAYMENT_METHODS: RegionPaymentMethod[] = [
  {
    "code": "card",
    "label": "Tarjeta de crédito o débito",
    "description": "Visa, Mastercard y American Express. Pago seguro procesado por tu pasarela.",
    "kind": "card",
    "flow": "inline",
    "providers": [
      "mercadopago",
      "stripe"
    ],
    "installments": null,
    "min_amount": null,
    "max_amount": null,
    "icon": "CreditCard",
    "fiscal_payment_form": "04,28"
  },
  {
    "code": "mercadopago",
    "label": "Mercado Pago",
    "description": "Paga con tu cuenta de Mercado Pago: saldo, tarjetas guardadas o meses.",
    "kind": "wallet",
    "flow": "redirect",
    "providers": [
      "mercadopago"
    ],
    "installments": null,
    "min_amount": null,
    "max_amount": null,
    "icon": "Wallet",
    "fiscal_payment_form": "06,04,28"
  },
  {
    "code": "oxxo",
    "label": "Efectivo en OXXO",
    "description": "Recibe una referencia y paga en cualquier tienda OXXO. Confirmamos tu pedido cuando se acredita el pago.",
    "kind": "cash_voucher",
    "flow": "voucher",
    "providers": [
      "mercadopago",
      "stripe"
    ],
    "installments": null,
    "min_amount": null,
    "max_amount": null,
    "expires_hours": 72,
    "icon": "Store",
    "fiscal_payment_form": "01"
  },
  {
    "code": "spei",
    "label": "Transferencia SPEI",
    "description": "Paga desde la app de tu banco con una CLABE única para tu pedido; se confirma en minutos.",
    "kind": "bank_transfer",
    "flow": "instructions",
    "providers": [
      "mercadopago",
      "stripe"
    ],
    "installments": null,
    "min_amount": null,
    "max_amount": null,
    "expires_hours": 24,
    "icon": "Landmark",
    "fiscal_payment_form": "03"
  }
] as RegionPaymentMethod[]

export const SEED_MX_FISCAL_ID_PATTERN = "^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{2}[0-9A]$"
export const SEED_MX_GENERIC_IDS: string[] = ["XAXX010101000", "XEXX010101000"]
