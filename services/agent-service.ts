import { ChatMessage, LocalLlama } from './local-llama';
import { ErpService } from './erp-service';
import { GBNF_GRAMMAR } from './grammar-constant';

/**
 * Especificación compacta de herramientas para inyectar en el System Prompt de la IA.
 * Reduce el consumo de tokens de ~1500 (OpenAPI crudo) a menos de 200 tokens.
 */
export const ERP_TOOLS = [
  {
    name: 'ListarUsuarios',
    description: 'Obtiene todos los usuarios/clientes registrados en el ERP.',
    parameters: '{}'
  },
  {
    name: 'ObtenerUsuario',
    description: 'Obtiene la información de un usuario específico.',
    parameters: '{"id": número}'
  },
  {
    name: 'CrearUsuario',
    description: 'Registra un nuevo usuario/cliente en el ERP. "nombre" y "email" son obligatorios. "password" y "rol" son opcionales.',
    parameters: '{"nombre": "string", "email": "string", "password": "string(opcional)", "rol": "string(opcional)"}'
  },
  {
    name: 'ActualizarUsuario',
    description: 'Actualiza los datos de un usuario existente. Solo "id" es obligatorio. Los demás campos son opcionales.',
    parameters: '{"id": número, "nombre": "string(opcional)", "email": "string(opcional)", "password": "string(opcional)", "rol": "string(opcional)"}'
  },
  {
    name: 'ListarInventario',
    description: 'Lista los productos y su stock actual en el almacén.',
    parameters: '{}'
  },
  {
    name: 'ObtenerProducto',
    description: 'Obtiene los detalles de un producto específico en el inventario.',
    parameters: '{"id": número}'
  },
  {
    name: 'CrearProducto',
    description: 'Registra un nuevo producto en el catálogo. "nombre" y "descripcion" son obligatorios.',
    parameters: '{"nombre": "string", "descripcion": "string", "stock_actual": número(opcional)}'
  },
  {
    name: 'AumentarStock',
    description: 'Incrementa el stock de un producto existente.',
    parameters: '{"id": número, "cantidad": número}'
  },
  {
    name: 'DisminuirStock',
    description: 'Disminuye el stock de un producto existente. Usa "producto_id" para identificar el producto.',
    parameters: '{"producto_id": número, "cantidad": número}'
  },
  {
    name: 'RegistrarVenta',
    description: 'Registra una nueva venta de productos a un cliente. "usuario_id" y "det_venta" son obligatorios.',
    parameters: '{"usuario_id": número, "det_venta": [{"producto_id": número, "precio_unitario": número, "cantidad": número}], "estado": "string(opcional)"}'
  },
  {
    name: 'RegistrarCompra',
    description: 'Registra la compra de insumos/productos. "usuario_id" y "det_compra" son obligatorios.',
    parameters: '{"usuario_id": número, "det_compra": [{"producto_id": número, "precio_unitario": número, "cantidad": número}], "estado": "string(opcional)"}'
  },
  {
    name: 'ListarComprasUsuario',
    description: 'Lista todas las compras realizadas por un usuario específico.',
    parameters: '{"id": número}'
  }
];

/**
 * Registro dinámico de despacho de herramientas asociadas al cliente HTTP.
 */
const ToolRegistry: Record<string, (args: any) => Promise<any>> = {
  'ListarUsuarios': () => ErpService.listarUsuarios(),
  'ObtenerUsuario': (args) => ErpService.obtenerUsuario(args.id),
  'CrearUsuario': (args) => ErpService.crearUsuario(args),
  'ActualizarUsuario': (args) => ErpService.actualizarUsuario(args),
  'ListarInventario': () => ErpService.listarInventario(),
  'ObtenerProducto': (args) => ErpService.obtenerProducto(args.id),
  'CrearProducto': (args) => ErpService.crearProducto(args),
  'AumentarStock': (args) => ErpService.aumentarStock(args),
  'DisminuirStock': (args) => ErpService.disminuirStock(args),
  'RegistrarVenta': (args) => ErpService.registrarVenta(args),
  'RegistrarCompra': (args) => ErpService.registrarCompra(args),
  'ListarComprasUsuario': (args) => ErpService.listarComprasUsuario(args.id),
};

/**
 * Prompt del Sistema condensado para ahorrar tokens del contexto y mejorar la velocidad.
 */
const getSystemPrompt = (): string => {
  const toolsFormatted = ERP_TOOLS.map(t => `- **${t.name}** ${t.parameters}: ${t.description}`).join('\n');

  return `Eres un Agente ERP local. Resuelve peticiones usando el patrón ReAct:

Thought: [Razonamiento sobre lo que debes hacer]
Action: NombreHerramienta{JSON}
Observation: [Respuesta del ERP. ¡NUNCA la inventes, el sistema te la dará!]

Repite el ciclo para múltiples tareas. Al terminar, concluye con:
Thought: [Razonamiento de cierre]
Final Answer: [Respuesta final al usuario en español]

=== EJEMPLO DE FLUJO ===
User: listame los usuarios
Thought: El usuario quiere ver la lista de usuarios. Debo llamar a ListarUsuarios.
Action: ListarUsuarios{}
Observation: [{"id":1,"nombre":"Sebastian","email":"sebas@gmail.com","rol":"Admin"}]
Thought: Ya tengo la lista de usuarios reales del ERP. Responderé al usuario.
Final Answer: Los usuarios registrados son Sebastian (sebas@gmail.com, Admin).

=== HERRAMIENTAS ===
${toolsFormatted}

=== REGLAS IMPORTANTES ===
1. NUNCA alucines ni inventes el bloque "Observation:". Genera únicamente "Thought:" y "Action: NombreHerramienta{JSON}" en una sola línea, y DETENTE de inmediato para que el sistema ejecute la herramienta.
2. Si hay múltiples tareas, ejecútalas una por una secuencialmente (Action 1 -> Observation 1 -> Action 2 -> Observation 2...).
3. Cada vez que generes una Acción, asegúrate de cerrar la estructura JSON con un carácter '}' justo antes de finalizar la línea. Nunca omitas las llaves de cierre
4. Si el ERP devuelve un error, corrígelo en tu Thought/Action o explícaselo al usuario.
5. Responde en español de forma concisa y profesional.`;
};

/**
 * Comprime las respuestas del ERP antes de enviarlas a Llama para ahorrar un 80% de tokens de contexto.
 * Filtra metadatos de BD, timestamps, contraseñas y limita los arreglos a un máximo de 8 elementos.
 */
function compressApiResponse(toolName: string, data: any): any {
  if (!data) return data;
  if (data.error) return data;

  try {
    // Si la respuesta viene envuelta en un objeto { ok: true, data: [...] } (estilo estándar de este backend)
    if (data.data !== undefined) {
      const nestedData = data.data;
      if (Array.isArray(nestedData)) {
        const limited = nestedData.slice(0, 8);
        return limited.map(item => compressItem(toolName, item));
      }
      return compressItem(toolName, nestedData);
    }

    // Si es directamente un array de objetos
    if (Array.isArray(data)) {
      const limited = data.slice(0, 8);
      return limited.map(item => compressItem(toolName, item));
    }

    // Si es un objeto directo
    return compressItem(toolName, data);
  } catch (e) {
    return data;
  }
}

function compressItem(toolName: string, item: any): any {
  if (typeof item !== 'object' || item === null) return item;

  // Propiedades útiles para conservar por herramienta
  const keysToKeep: Record<string, string[]> = {
    'ListarUsuarios': ['id', 'nombre', 'email', 'rol'],
    'ObtenerUsuario': ['id', 'nombre', 'email', 'rol'],
    'ListarInventario': ['id', 'nombre', 'stock_actual', 'descripcion'],
    'ObtenerProducto': ['id', 'nombre', 'stock_actual', 'descripcion'],
    'ListarComprasUsuario': ['id', 'usuario_id', 'total', 'estado'],
  };

  const allowedKeys = keysToKeep[toolName];
  if (!allowedKeys) {
    // Regla genérica: Eliminar contraseñas, hashes y timestamps de BD
    const keysToRemove = ['password', 'created_at', 'updated_at', 'deleted_at', '__v'];
    const cleaned: any = {};
    for (const key of Object.keys(item)) {
      if (!keysToRemove.includes(key)) {
        cleaned[key] = item[key];
      }
    }
    return cleaned;
  }

  const cleaned: any = {};
  for (const key of allowedKeys) {
    if (item[key] !== undefined) {
      cleaned[key] = item[key];
    }
  }
  return cleaned;
}

/**
 * Normaliza las llaves de los argumentos de herramientas traduciendo sinónimos comunes
 * (como "correo" a "email", o "contraseña" a "password") para que la llamada HTTP
 * al ERP nunca falle si el modelo local utiliza nombres diferentes.
 */
function normalizeToolArgs(toolName: string, args: any): any {
  if (typeof args !== 'object' || args === null) return args;

  const normalized: any = {};

  // Mapeo exhaustivo de sinónimos comunes (claves en minúscula para comparación insensible)
  const keyMappings: Record<string, string> = {
    // Usuarios
    'name': 'nombre',
    'correo': 'email',
    'mail': 'email',
    'contraseña': 'password',
    'contrasena': 'password',
    'pass': 'password',
    'role': 'rol',

    // Productos e inventario
    'description': 'descripcion',
    'desc': 'descripcion',
    'stock': 'stock_actual',
    'product_id': 'producto_id',
    'quantity': 'cantidad',
    'cant': 'cantidad',
  };

  for (const key of Object.keys(args)) {
    const value = args[key];
    const normalizedKey = keyMappings[key.toLowerCase()] || key;
    normalized[normalizedKey] = value;
  }

  // Correcciones específicas por herramienta para IDs cruzados
  if (toolName === 'CrearUsuario' || toolName === 'ActualizarUsuario') {
    if (normalized.usuario_id !== undefined && normalized.id === undefined) {
      normalized.id = normalized.usuario_id;
    }
  }

  if (toolName === 'AumentarStock' || toolName === 'DisminuirStock') {
    if (toolName === 'AumentarStock' && normalized.producto_id !== undefined && normalized.id === undefined) {
      normalized.id = normalized.producto_id;
    }
    if (toolName === 'DisminuirStock' && normalized.id !== undefined && normalized.producto_id === undefined) {
      normalized.producto_id = normalized.id;
    }
  }

  return normalized;
}

export const AgentService = {
  /**
   * Ejecuta el bucle inteligente de ReAct, administrando el stream,
   * interceptando las llamadas a herramientas y reanudando la inferencia
   * tantas veces como sea necesario hasta obtener el Final Answer.
   */
  /**
   * Ejecuta el pipeline inteligente de 4 pasos (Enfoque B):
   * 1. Clasificación rápida del intento (charla directa vs. llamada a herramienta del ERP).
   * 2. Extracción de parámetros estructurados bajo estricto control de la gramática GBNF.
   * 3. Despacho dinámico de la llamada HTTP, normalización y compresión.
   * 4. Explicación/Sintetizador final fluido de los resultados del ERP en español.
   */
  async runAgentLoop(
    history: ChatMessage[],
    onToken: (token: string) => void,
    onStateChange: (state: string) => void
  ): Promise<string> {

    // Obtener la última petición escrita por el usuario
    const userQuery = history[history.length - 1]?.content || '';
    console.log(`[ReAct Agente] Iniciando proceso multi-paso para: "${userQuery}"`);

    // ----------------------------------------------------
    // PASO 1: Clasificador de Intención
    // ----------------------------------------------------
    onStateChange('Clasificando intención...');
    onToken('*Analizando petición...*\n');

    const validToolsList = ERP_TOOLS.map(t => t.name).join(', ');
    const classifierPrompt = `Analiza la petición del usuario y decide si requiere llamar a una herramienta del ERP para obtener o modificar datos, o si es una consulta de charla directa/saludo.
Responde ÚNICAMENTE con una línea siguiendo este formato:
TOOL: [NombreDeHerramienta]

Herramientas válidas: ${validToolsList}
Si no se requiere ninguna herramienta, responde exactamente:
TOOL: Ninguna

Mensaje del usuario: "${userQuery}"
Respuesta:`;

    const classifierHistory: ChatMessage[] = [
      {
        id: 'classifier-system',
        role: 'system',
        content: 'Eres un clasificador de intenciones estricto. Tu única respuesta permitida debe ser TOOL: [NombreHerramienta] o TOOL: Ninguna.',
        timestamp: Date.now()
      },
      {
        id: 'classifier-user',
        role: 'user',
        content: classifierPrompt,
        timestamp: Date.now()
      }
    ];

    console.log('[ReAct Agente] Ejecutando Paso 1 (Clasificador)...');
    const rawClassifierResponse = await LocalLlama.generateResponse(
      classifierHistory,
      () => {}, // Silencioso
      ['\n', 'TOOL: Ninguna\n']
    );

    const toolMatch = rawClassifierResponse.match(/TOOL:\s*(\w+)/i);
    const detectedTool = toolMatch ? toolMatch[1] : 'Ninguna';
    console.log(`[ReAct Agente] Intención clasificada: ${detectedTool}`);

    // Si es charla directa (TOOL: Ninguna), saltar directamente a responder
    if (detectedTool === 'Ninguna' || !ToolRegistry[detectedTool]) {
      console.log('[ReAct Agente] Petición califica como charla directa. Generando respuesta libre...');
      onStateChange('Pensando...');

      let chatResponse = '';
      await LocalLlama.generateResponse(
        history,
        (token) => {
          chatResponse += token;
          onToken(chatResponse);
        }
      );
      return chatResponse;
    }

    // ----------------------------------------------------
    // PASO 2: Extractor Estructurado de Parámetros GBNF
    // ----------------------------------------------------
    onStateChange('Extrayendo parámetros...');
    onToken(`*Analizando petición...*\n*Extrayendo parámetros estructurados con GBNF...*\n`);

    const extractorPrompt = `Extrae un arreglo JSON con la estructura del endpoint ERP correspondiente para satisfacer la siguiente petición del usuario.
Petición: "${userQuery}"`;

    const extractorHistory: ChatMessage[] = [
      {
        id: 'extractor-system',
        role: 'system',
        content: 'Extrae exclusivamente la estructura JSON de la acción ERP requerida en un array. Usa estrictamente las claves válidas.',
        timestamp: Date.now()
      },
      {
        id: 'extractor-user',
        role: 'user',
        content: extractorPrompt,
        timestamp: Date.now()
      }
    ];

    console.log(`[ReAct Agente] Ejecutando Paso 2 (Extractor GBNF) para la herramienta: ${detectedTool}...`);
    const gbnfResponse = await LocalLlama.generateResponse(
      extractorHistory,
      () => {}, // Silencioso
      [],
      GBNF_GRAMMAR // Inyección nativa del compilador GBNF
    );

    console.log('[ReAct Agente] Respuesta GBNF recibida:', gbnfResponse);

    // ----------------------------------------------------
    // PASO 3: Ejecución de Herramientas y Normalización
    // ----------------------------------------------------
    onStateChange('Ejecutando operación...');
    onToken(`*Analizando petición...*\n*Extrayendo parámetros estructurados con GBNF...*\n*Ejecutando operaciones en el ERP...*\n`);

    let actions: any[] = [];
    try {
      actions = JSON.parse(gbnfResponse);
    } catch (e) {
      console.error('[ReAct Agente Error] Error al parsear JSON devuelto por GBNF. Reintentando limpieza básica...', e);
      try {
        let fixedResponse = gbnfResponse.trim();
        if (fixedResponse.startsWith('[') && !fixedResponse.endsWith(']')) {
          fixedResponse += ']';
        } else if (fixedResponse.startsWith('{') && !fixedResponse.endsWith('}')) {
          fixedResponse += '}';
        }
        actions = JSON.parse(fixedResponse);
      } catch (innerErr) {
        return `Error: No se pudo estructurar el comando JSON del ERP. (${e})`;
      }
    }

    const erpResults: string[] = [];

    for (const action of actions) {
      const rawOperation = action.operation;
      const module = action.module;

      // Mapear el formato estricto del GBNF al nombre del despachador TypeScript (CamelCase)
      let mappedToolName = '';
      if (module === 'usuarios') {
        if (rawOperation === 'crear') mappedToolName = 'CrearUsuario';
        else if (rawOperation === 'listar') mappedToolName = 'ListarUsuarios';
        else if (rawOperation === 'actualizar') mappedToolName = 'ActualizarUsuario';
        else if (rawOperation === 'obtener') mappedToolName = 'ObtenerUsuario';
      } else if (module === 'inventario') {
        if (rawOperation === 'crear') mappedToolName = 'CrearProducto';
        else if (rawOperation === 'listar') mappedToolName = 'ListarInventario';
        else if (rawOperation === 'obtener') mappedToolName = 'ObtenerProducto';
        else if (rawOperation === 'aumentar_stock') mappedToolName = 'AumentarStock';
        else if (rawOperation === 'disminuir_stock') mappedToolName = 'DisminuirStock';
      } else if (module === 'ventas') {
        if (rawOperation === 'crear') mappedToolName = 'RegistrarVenta';
      } else if (module === 'compras') {
        if (rawOperation === 'crear') mappedToolName = 'RegistrarCompra';
        else if (rawOperation === 'listar') mappedToolName = 'ListarComprasUsuario';
      }

      if (!mappedToolName || !ToolRegistry[mappedToolName]) {
        erpResults.push(`Operación no soportada o mapeada: "${rawOperation}" en módulo "${module}".`);
        continue;
      }

      console.log(`[ReAct Agente] Despachando a ToolRegistry: ${mappedToolName}...`);
      onStateChange(`Llamando al ERP: ${mappedToolName}...`);

      let apiResponseStr = '';
      try {
        const rawData = action.data || {};
        // Aplicar la capa de normalización de claves defensiva (ej. "correo" -> "email")
        const normalizedArgs = normalizeToolArgs(mappedToolName, rawData);

        // Ejecutar llamada física al Gateway ERP
        const rawResponse = await ToolRegistry[mappedToolName](normalizedArgs);

        // Comprimir respuesta para optimizar RAM en el celular
        const compressedResponse = compressApiResponse(mappedToolName, rawResponse);
        apiResponseStr = JSON.stringify(compressedResponse);
      } catch (err: any) {
        console.error(`[ReAct Agente Error] en ejecución de ${mappedToolName}:`, err);
        apiResponseStr = JSON.stringify({ error: err.message || 'Fallo al conectar con el servidor' });
      }

      erpResults.push(`Herramienta Ejecutada: ${mappedToolName}\nResultado Real del Servidor: ${apiResponseStr}`);
    }

    // ----------------------------------------------------
    // PASO 4: Explainer / Sintetizador de Respuesta Final
    // ----------------------------------------------------
    onStateChange('Redactando respuesta...');

    const erpResultsBlock = erpResults.join('\n\n');
    const explainerPrompt = `Eres un asistente inteligente de ERP muy amigable, útil y profesional.
Explica al usuario de forma detallada, clara y directa en español los resultados obtenidos de las operaciones del servidor, basándote de forma estricta únicamente en los datos reales del ERP suministrados abajo.

Petición original del usuario: "${userQuery}"

DATOS REALES DEVUELTOS POR EL SERVIDOR DEL ERP (PostgreSQL):
${erpResultsBlock}

Instrucción: Escribe una respuesta final amigable en español detallando los datos reales. Nunca alucines identificadores, productos o usuarios que no figuren en los datos del ERP.`;

    const explainerHistory: ChatMessage[] = [
      {
        id: 'explainer-system',
        role: 'system',
        content: 'Eres un redactor experto que explica de forma profesional los datos devueltos por bases de datos PostgreSQL y servidores ERP.',
        timestamp: Date.now()
      },
      {
        id: 'explainer-user',
        role: 'user',
        content: explainerPrompt,
        timestamp: Date.now()
      }
    ];

    console.log('[ReAct Agente] Ejecutando Paso 4 (Explainer en streaming)...');
    let finalExplanation = '';

    await LocalLlama.generateResponse(
      explainerHistory,
      (token) => {
        finalExplanation += token;
        onToken(finalExplanation); // streaming reactivo al usuario
      }
    );

    onStateChange('');
    console.log('[ReAct Agente] Pipeline finalizado con éxito.');
    return finalExplanation.trim();
  }
};
