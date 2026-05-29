const BASE_URL = 'https://serverlest-topicos-gateway-8zoia048.uc.gateway.dev';

/**
 * Cliente HTTP simplificado para el API Gateway del ERP.
 * Todas las respuestas son devueltas en formato estructurado (JSON o texto plano de error)
 * para que el Agente ReAct pueda leerlas e interpretarlas sin provocar caídas.
 */
export const ErpService = {
  /**
   * Helper privado para realizar peticiones HTTP seguras y limpias.
   */
  async request(endpoint: string, method: 'GET' | 'POST' | 'PUT', body?: any): Promise<any> {
    const url = `${BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    try {
      console.log(`[ERP HTTP] ${method} a ${url}`, body ? JSON.stringify(body) : '');
      const response = await fetch(url, options);
      
      const text = await response.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}: Error de servidor`);
      }

      return data;
    } catch (error: any) {
      console.error(`[ERP Error] en ${method} ${endpoint}:`, error);
      throw new Error(error.message || 'Error de conexión con el API Gateway');
    }
  },

  // ==========================================
  // MÓDULO: USUARIOS
  // ==========================================

  async listarUsuarios(): Promise<any> {
    return this.request('/usuario/listar', 'GET');
  },

  async obtenerUsuario(id: number): Promise<any> {
    if (!id || isNaN(id)) throw new Error('El ID de usuario debe ser un número válido.');
    return this.request(`/usuario/obtener/${id}`, 'GET');
  },

  async crearUsuario(params: { nombre: string; email: string; password?: string; rol?: string }): Promise<any> {
    if (!params.nombre || !params.email) {
      throw new Error('Los campos "nombre" y "email" son obligatorios.');
    }
    const payload = {
      nombre: params.nombre,
      email: params.email,
      password: params.password || '123456', // Contraseña por defecto si no se especifica
      rol: params.rol || 'user',
    };
    return this.request('/usuario/crear', 'POST', payload);
  },

  async actualizarUsuario(params: { id: number; nombre?: string; email?: string; password?: string; rol?: string }): Promise<any> {
    if (!params.id || isNaN(params.id)) {
      throw new Error('El ID del usuario es obligatorio y debe ser un número.');
    }
    return this.request('/usuario/actualizar', 'PUT', params);
  },

  // ==========================================
  // MÓDULO: INVENTARIO (PRODUCTOS)
  // ==========================================

  async listarInventario(): Promise<any> {
    return this.request('/inventario/listar', 'GET');
  },

  async obtenerProducto(id: number): Promise<any> {
    if (!id || isNaN(id)) throw new Error('El ID del producto debe ser un número válido.');
    return this.request(`/inventario/obtener/${id}`, 'GET');
  },

  async crearProducto(params: { nombre: string; descripcion: string; stock_actual?: number }): Promise<any> {
    if (!params.nombre || !params.descripcion) {
      throw new Error('Los campos "nombre" y "descripcion" del producto son obligatorios.');
    }
    const payload = {
      nombre: params.nombre,
      descripcion: params.descripcion,
      stock_actual: params.stock_actual !== undefined ? Number(params.stock_actual) : 0,
    };
    return this.request('/inventario/crear', 'POST', payload);
  },

  async aumentarStock(params: { id: number; cantidad: number }): Promise<any> {
    if (!params.id || isNaN(params.id)) throw new Error('El ID del producto es obligatorio.');
    if (!params.cantidad || isNaN(params.cantidad) || params.cantidad <= 0) {
      throw new Error('La cantidad a aumentar debe ser un número mayor que 0.');
    }
    const payload = {
      id: Number(params.id),
      cantidad: Number(params.cantidad),
    };
    return this.request('/inventario/aumentar_stock', 'PUT', payload);
  },

  async disminuirStock(params: { producto_id: number; cantidad: number }): Promise<any> {
    const prodId = params.producto_id;
    if (!prodId || isNaN(prodId)) throw new Error('El "producto_id" del producto es obligatorio.');
    if (!params.cantidad || isNaN(params.cantidad) || params.cantidad <= 0) {
      throw new Error('La cantidad a disminuir debe ser un número mayor que 0.');
    }
    // NOTA: Se mapea con "producto_id" según el openapi.yaml del backend
    const payload = {
      producto_id: Number(prodId),
      cantidad: Number(params.cantidad),
    };
    return this.request('/inventario/disminuir_stock', 'PUT', payload);
  },

  // ==========================================
  // MÓDULO: VENTAS
  // ==========================================

  async registrarVenta(params: { usuario_id: number; det_venta: any[]; estado?: string }): Promise<any> {
    if (!params.usuario_id || isNaN(params.usuario_id)) {
      throw new Error('El ID del usuario ("usuario_id") que realiza la compra es obligatorio.');
    }
    if (!params.det_venta || !Array.isArray(params.det_venta) || params.det_venta.length === 0) {
      throw new Error('El detalle de la venta ("det_venta") debe ser un arreglo con al menos un producto.');
    }

    // Validar y limpiar cada línea del detalle
    const cleanedDetail = params.det_venta.map((item, index) => {
      if (!item.producto_id || isNaN(item.producto_id)) {
        throw new Error(`Detalle en posición ${index}: El "producto_id" del producto es obligatorio.`);
      }
      if (item.precio_unitario === undefined || isNaN(item.precio_unitario)) {
        throw new Error(`Detalle en posición ${index}: El "precio_unitario" es obligatorio.`);
      }
      if (!item.cantidad || isNaN(item.cantidad) || item.cantidad <= 0) {
        throw new Error(`Detalle en posición ${index}: La "cantidad" debe ser un número entero mayor que 0.`);
      }
      return {
        producto_id: Number(item.producto_id),
        precio_unitario: Number(item.precio_unitario),
        cantidad: Number(item.cantidad),
      };
    });

    const payload = {
      usuario_id: Number(params.usuario_id),
      det_venta: cleanedDetail,
      estado: params.estado || 'completado',
    };

    return this.request('/venta/crear', 'POST', payload);
  },

  async crearDetalleVenta(params: { venta_id: number; producto_id: number; cantidad: number; precio_unitario: number }): Promise<any> {
    if (!params.venta_id || !params.producto_id || !params.cantidad || !params.precio_unitario) {
      throw new Error('Los campos "venta_id", "producto_id", "cantidad" y "precio_unitario" son obligatorios.');
    }
    const payload = {
      venta_id: Number(params.venta_id),
      producto_id: Number(params.producto_id),
      cantidad: Number(params.cantidad),
      precio_unitario: Number(params.precio_unitario),
    };
    return this.request('/venta/crear_detalle_venta', 'POST', payload);
  },

  async anularDetalleVenta(params: { id: number }): Promise<any> {
    if (!params.id || isNaN(params.id)) {
      throw new Error('El ID de detalle de venta a anular ("id") es obligatorio.');
    }
    // NOTA: Se envía con el parámetro "id" de acuerdo a la OpenApi
    return this.request('/venta/anular_detalle_venta', 'PUT', { id: Number(params.id) });
  },

  // ==========================================
  // MÓDULO: COMPRAS
  // ==========================================

  async registrarCompra(params: { usuario_id: number; det_compra: any[]; estado?: string }): Promise<any> {
    if (!params.usuario_id || isNaN(params.usuario_id)) {
      throw new Error('El ID del usuario ("usuario_id") que realiza la compra es obligatorio.');
    }
    if (!params.det_compra || !Array.isArray(params.det_compra) || params.det_compra.length === 0) {
      throw new Error('El detalle de la compra ("det_compra") debe ser un arreglo con al menos un producto.');
    }

    // Validar y limpiar cada línea
    const cleanedDetail = params.det_compra.map((item, index) => {
      if (!item.producto_id || isNaN(item.producto_id)) {
        throw new Error(`Detalle en posición ${index}: El "producto_id" del producto comprado es obligatorio.`);
      }
      if (item.precio_unitario === undefined || isNaN(item.precio_unitario)) {
        throw new Error(`Detalle en posición ${index}: El "precio_unitario" de la compra es obligatorio.`);
      }
      if (!item.cantidad || isNaN(item.cantidad) || item.cantidad <= 0) {
        throw new Error(`Detalle en posición ${index}: La "cantidad" debe ser mayor que 0.`);
      }
      return {
        producto_id: Number(item.producto_id),
        precio_unitario: Number(item.precio_unitario),
        cantidad: Number(item.cantidad),
      };
    });

    const payload = {
      usuario_id: Number(params.usuario_id),
      det_compra: cleanedDetail,
      estado: params.estado || 'completado',
    };

    return this.request('/compra/crear', 'POST', payload);
  },

  async crearDetalleCompra(params: { compra_id: number; producto_id: number; precio_unitario: number; cantidad?: number }): Promise<any> {
    if (!params.compra_id || !params.producto_id || params.precio_unitario === undefined) {
      throw new Error('Los campos "compra_id", "producto_id" y "precio_unitario" son obligatorios.');
    }
    const payload = {
      compra_id: Number(params.compra_id),
      producto_id: Number(params.producto_id),
      precio_unitario: Number(params.precio_unitario),
      cantidad: params.cantidad !== undefined ? Number(params.cantidad) : 1,
    };
    return this.request('/detalle_compra/crear', 'POST', payload);
  },

  async listarComprasUsuario(id: number): Promise<any> {
    if (!id || isNaN(id)) throw new Error('El ID de usuario para listar compras debe ser un número válido.');
    return this.request(`/compra/listar/${id}`, 'GET');
  },

  async listarDetallesCompra(id: number): Promise<any> {
    if (!id || isNaN(id)) throw new Error('El ID de la cabecera de compra debe ser un número válido.');
    return this.request(`/detalle_compra/listar/${id}`, 'GET');
  }
};
