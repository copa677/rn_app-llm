import { ChatMessage, LocalLlama } from './local-llama';
import { ErpService } from './erp-service';

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
3. Si el ERP devuelve un error, corrígelo en tu Thought/Action o explícaselo al usuario.
4. Responde en español de forma concisa y profesional.`;
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

export const AgentService = {
  /**
   * Ejecuta el bucle inteligente de ReAct, administrando el stream,
   * interceptando las llamadas a herramientas y reanudando la inferencia
   * tantas veces como sea necesario hasta obtener el Final Answer.
   */
  async runAgentLoop(
    history: ChatMessage[],
    onToken: (token: string) => void,
    onStateChange: (state: string) => void
  ): Promise<string> {
    
    // 1. Construir e inyectar el System Prompt al principio si no existe
    const hasSystemPrompt = history.some(m => m.role === 'system');
    let agentHistory = [...history];
    if (!hasSystemPrompt) {
      agentHistory = [
        {
          id: 'react-system-prompt',
          role: 'system',
          content: getSystemPrompt(),
          timestamp: Date.now()
        },
        ...history
      ];
    }

    let loopCount = 0;
    const maxLoops = 6; // Límite para prevenir bucles infinitos en Llama
    let accumulatedTrace = ''; // Todo lo generado se acumulará aquí para el chat

    while (loopCount < maxLoops) {
      loopCount++;
      console.log(`[ReAct Loop] Iniciando iteración ${loopCount}...`);
      onStateChange('Pensando...');

      let currentTurnText = '';

      // Invocar a LocalLlama para inferencia con streaming y stop tokens para ReAct
      await LocalLlama.generateResponse(
        agentHistory,
        (token) => {
          currentTurnText += token;
          accumulatedTrace += token;
          onToken(accumulatedTrace); // Mostrar el razonamiento de la IA en tiempo real
        },
        ['Observation:', '\nObservation:', 'Observation\n', 'Observation:\n']
      );

      console.log(`[ReAct Inferencia] Turno ${loopCount} finalizado.`);

      // Buscar si el modelo generó una acción en su texto. Soporta "Action:" y "Acción:" de forma insensible a mayúsculas/minúsculas.
      const actionHeaderRegex = /(?:Action|Acción|Accion):\s*(\w+)/i;
      const match = currentTurnText.match(actionHeaderRegex);

      if (match) {
        const toolName = match[1];
        
        // Extraer los argumentos en JSON si existen justo después del encabezado de la acción
        const remainingText = currentTurnText.substring(match.index! + match[0].length);
        const jsonMatch = remainingText.match(/^\s*(\{.*?\})/s);
        
        let toolArgsRaw = '{}';
        if (jsonMatch) {
          toolArgsRaw = jsonMatch[1];
        } else {
          console.log(`[ReAct Agente] No se detectaron llaves {} para la acción ${toolName}. Usando argumentos vacíos '{}'.`);
        }

        console.log(`[ReAct Agente] Acción detectada: ${toolName} con argumentos: ${toolArgsRaw}`);
        onStateChange(`Llamando al ERP: ${toolName}...`);

        let apiResponseStr = '';
        try {
          const toolArgs = JSON.parse(toolArgsRaw);
          
          if (ToolRegistry[toolName]) {
            // Ejecutar la llamada HTTP al ERP
            const rawResponse = await ToolRegistry[toolName](toolArgs);
            
            // Comprimir la respuesta del ERP antes de pasarla a la IA para ahorrar contexto
            const compressedResponse = compressApiResponse(toolName, rawResponse);
            apiResponseStr = JSON.stringify(compressedResponse);
          } else {
            apiResponseStr = JSON.stringify({ error: `La herramienta "${toolName}" no está registrada.` });
          }
        } catch (e: any) {
          console.error('[ReAct Error] Error al parsear o ejecutar la herramienta:', e);
          apiResponseStr = JSON.stringify({ error: `Argumentos inválidos o fallo al ejecutar: ${e.message}` });
        }

        // Agregar lo generado hasta el momento como mensaje del asistente
        agentHistory.push({
          id: Math.random().toString(36).substring(2, 11),
          role: 'assistant',
          content: currentTurnText,
          timestamp: Date.now()
        });

        // Insertar el resultado de la herramienta como Observation en el historial de chat
        const observationText = `\nObservation: ${apiResponseStr}\n`;
        accumulatedTrace += observationText;
        onToken(accumulatedTrace);

        agentHistory.push({
          id: Math.random().toString(36).substring(2, 11),
          role: 'user', // Se inyecta como rol de usuario para que Llama continúe
          content: observationText,
          timestamp: Date.now()
        });

      } else {
        // Si no hay más acciones, asumimos que llegó a "Final Answer"
        console.log('[ReAct Agente] No se detectaron más acciones. Bucle finalizado.');
        
        // Agregar respuesta de cierre al historial
        agentHistory.push({
          id: Math.random().toString(36).substring(2, 11),
          role: 'assistant',
          content: currentTurnText,
          timestamp: Date.now()
        });
        
        break;
      }
    }

    onStateChange('');
    return accumulatedTrace.trim();
  }
};
