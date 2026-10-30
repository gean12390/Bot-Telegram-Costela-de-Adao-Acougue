
import { Telegraf, Markup } from "telegraf";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);

if (!TOKEN || !ADMIN_ID || !Number.isSafeInteger(ADMIN_ID)) {
  throw new Error("Configure BOT_TOKEN e ADMIN_ID corretamente no .env");
}

const bot = new Telegraf(TOKEN);

const DATA_DIR = path.resolve("data");

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const CARTS_FILE = path.join(DATA_DIR, "carts.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initializeFile(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]", "utf8");
  }
}

initializeFile(PRODUCTS_FILE);
initializeFile(CARTS_FILE);
initializeFile(ORDERS_FILE);

// ==========================================
// FUNÇÕES DE ARQUIVOS
// ==========================================

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error("Erro lendo arquivo:", file, error);
    return [];
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function getProducts() {
  return readJSON(PRODUCTS_FILE);
}

function saveProducts(products) {
  saveJSON(PRODUCTS_FILE, products);
}

function getCarts() {
  return readJSON(CARTS_FILE);
}

function saveCarts(carts) {
  saveJSON(CARTS_FILE, carts);
}

function getOrders() {
  return readJSON(ORDERS_FILE);
}

function saveOrders(orders) {
  saveJSON(ORDERS_FILE, orders);
}

// ==========================================
// SESSÕES
// ==========================================

const productSessions = new Map();

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function isAdmin(ctx) {
  return ctx.from?.id === ADMIN_ID;
}

function money(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

function getUserCart(userId) {
  const carts = getCarts();

  return carts.find(cart => cart.userId === userId) || {
    userId,
    items: []
  };
}

function updateUserCart(cart) {
  const carts = getCarts();

  const index = carts.findIndex(
    item => item.userId === cart.userId
  );

  if (index >= 0) {
    carts[index] = cart;
  } else {
    carts.push(cart);
  }

  saveCarts(carts);
}

function getCartTotal(cart) {
  const products = getProducts();

  return cart.items.reduce((total, item) => {
    const product = products.find(p => p.id === item.productId);

    if (!product || !product.active) return total;

    return total + product.price * item.quantity;
  }, 0);
}

function mainMenu(admin = false) {
  const buttons = [
    [Markup.button.callback("🛍️ Ver produtos", "catalog")],
    [Markup.button.callback("🛒 Meu carrinho", "cart")],
    [Markup.button.callback("📦 Meus pedidos", "orders")]
  ];

  if (admin) {
    buttons.push([
      Markup.button.callback("⚙️ Administração", "admin")
    ]);
  }

  return Markup.inlineKeyboard(buttons);
}

// ==========================================
// MENU INICIAL
// ==========================================

bot.start(async (ctx) => {
  await ctx.reply(
    `Olá, ${ctx.from.first_name}! 👋\n\n` +
    "Bem-vindo à nossa loja!\n\n" +
    "Escolha uma opção abaixo:",
    mainMenu(isAdmin(ctx))
  );
});

// ==========================================
// MENU ADMINISTRATIVO
// ==========================================

bot.action("admin", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  await ctx.answerCbQuery();

  await ctx.editMessageText(
    "⚙️ ADMINISTRAÇÃO\n\nEscolha uma opção:",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ Adicionar produto", "add_product_help")],
      [Markup.button.callback("📋 Listar produtos", "admin_products")],
      [Markup.button.callback("🗑️ Excluir produto", "delete_product_help")],
      [Markup.button.callback("⬅️ Voltar", "home")]
    ])
  );
});

// ==========================================
// CADASTRO DE PRODUTOS
// ==========================================

bot.action("add_product_help", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  await ctx.answerCbQuery();

  productSessions.set(ctx.from.id, {
    step: "name",
    product: {}
  });

  await ctx.reply(
    "➕ CADASTRAR PRODUTO\n\n" +
    "Digite o nome do produto:"
  );
});

// ==========================================
// RECEBER DADOS DO PRODUTO
// ==========================================

bot.on("text", async (ctx, next) => {
  if (!isAdmin(ctx)) return next();

  const session = productSessions.get(ctx.from.id);

  if (!session) return next();

  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return next();

  if (session.step === "name") {
    if (text.length < 2) {
      return ctx.reply("Digite um nome válido.");
    }

    session.product.name = text;
    session.step = "description";

    return ctx.reply("📝 Agora digite a descrição do produto:");
  }

  if (session.step === "description") {
    session.product.description = text;
    session.step = "price";

    return ctx.reply("💰 Informe o preço. Exemplo: 89,90");
  }

  if (session.step === "price") {
    const price = Number(text.replace(",", "."));

    if (!Number.isFinite(price) || price <= 0) {
      return ctx.reply("❌ Preço inválido. Tente novamente.");
    }

    session.product.price = price;
    session.step = "photo";

    return ctx.reply(
      "📸 Agora envie a foto do produto como imagem.\n\n" +
      "Se não quiser foto, digite /semfoto"
    );
  }

  return next();
});

// ==========================================
// PRODUTO SEM FOTO
// ==========================================

bot.command("semfoto", async (ctx) => {
  if (!isAdmin(ctx)) return;

  const session = productSessions.get(ctx.from.id);

  if (!session || session.step !== "photo") {
    return ctx.reply("Não existe cadastro aguardando foto.");
  }

  session.product.photoFileId = null;
  session.step = "confirmation";

  await showProductConfirmation(ctx, session.product);
});

// ==========================================
// RECEBER FOTO
// ==========================================

bot.on("photo", async (ctx) => {
  if (!isAdmin(ctx)) return;

  const session = productSessions.get(ctx.from.id);

  if (!session || session.step !== "photo") return;

  const photos = ctx.message.photo;
  const photo = photos[photos.length - 1];

  session.product.photoFileId = photo.file_id;
  session.step = "confirmation";

  await showProductConfirmation(ctx, session.product);
});

// ==========================================
// MOSTRAR PRÉVIA DO PRODUTO
// ==========================================

async function showProductConfirmation(ctx, product) {
  const caption =
    "📦 CONFIRME O PRODUTO\n\n" +
    `Nome: ${product.name}\n` +
    `Descrição: ${product.description}\n` +
    `Preço: R$ ${money(product.price)}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Salvar produto", "confirm_product")],
    [Markup.button.callback("❌ Cancelar", "cancel_product")]
  ]);

  if (product.photoFileId) {
    await ctx.replyWithPhoto(product.photoFileId, {
      caption,
      ...keyboard
    });
  } else {
    await ctx.reply(caption, keyboard);
  }
}

// ==========================================
// CONFIRMAR PRODUTO
// ==========================================

bot.action("confirm_product", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  const session = productSessions.get(ctx.from.id);

  if (!session || session.step !== "confirmation") {
    return ctx.answerCbQuery("Cadastro não encontrado.");
  }

  const products = getProducts();

  const product = {
    id: Date.now().toString(),
    ...session.product,
    active: true
  };

  products.push(product);

  saveProducts(products);

  productSessions.delete(ctx.from.id);

  await ctx.answerCbQuery("Produto salvo!");

  await ctx.reply(
    "✅ PRODUTO CADASTRADO!\n\n" +
    `📦 ${product.name}\n` +
    `💰 R$ ${money(product.price)}`
  );
});

// ==========================================
// CANCELAR CADASTRO
// ==========================================

bot.action("cancel_product", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  productSessions.delete(ctx.from.id);

  await ctx.answerCbQuery("Cadastro cancelado.");

  await ctx.reply("❌ Cadastro cancelado.");
});

// ==========================================
// LISTAR PRODUTOS
// ==========================================

bot.action("admin_products", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  await ctx.answerCbQuery();

  const products = getProducts();

  if (products.length === 0) {
    return ctx.reply("Nenhum produto cadastrado.");
  }

  for (const product of products) {
    const caption =
      `📦 ${product.name}\n\n` +
      `${product.description}\n\n` +
      `💰 R$ ${money(product.price)}\n` +
      `🆔 ${product.id}`;

    if (product.photoFileId) {
      await ctx.replyWithPhoto(product.photoFileId, {
        caption
      });
    } else {
      await ctx.reply(caption);
    }
  }
});

// ==========================================
// EXCLUIR PRODUTO
// ==========================================

bot.action("delete_product_help", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  await ctx.answerCbQuery();

  const products = getProducts();

  if (products.length === 0) {
    return ctx.reply("Não existem produtos cadastrados.");
  }

  const buttons = products.map(product => [
    Markup.button.callback(
      `🗑️ ${product.name}`,
      `delete_${product.id}`
    )
  ]);

  await ctx.reply(
    "Selecione o produto que deseja excluir:",
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/^delete_(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Acesso não autorizado.");
  }

  const id = ctx.match[1];

  const products = getProducts();

  const filtered = products.filter(p => p.id !== id);

  if (filtered.length === products.length) {
    return ctx.answerCbQuery("Produto não encontrado.");
  }

  saveProducts(filtered);

  // Remover também dos carrinhos
  const carts = getCarts();

  for (const cart of carts) {
    cart.items = cart.items.filter(
      item => item.productId !== id
    );
  }

  saveCarts(carts);

  await ctx.answerCbQuery("Produto excluído!");

  await ctx.reply("✅ Produto excluído com sucesso!");
});

// ==========================================
// CATÁLOGO
// ==========================================

bot.action("catalog", async (ctx) => {
  await ctx.answerCbQuery();

  const products = getProducts().filter(p => p.active);

  if (products.length === 0) {
    return ctx.reply("Nosso catálogo está vazio no momento. ❤️");
  }

  await ctx.reply("🛍️ NOSSO CATÁLOGO");

  for (const product of products) {
    const caption =
      `📦 ${product.name}\n\n` +
      `${product.description}\n\n` +
      `💰 R$ ${money(product.price)}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🛒 Adicionar ao carrinho",
          `addcart_${product.id}`
        )
      ]
    ]);

    if (product.photoFileId) {
      await ctx.replyWithPhoto(product.photoFileId, {
        caption,
        ...keyboard
      });
    } else {
      await ctx.reply(caption, keyboard);
    }
  }
});

// ==========================================
// ADICIONAR AO CARRINHO
// ==========================================

bot.action(/^addcart_(.+)$/, async (ctx) => {
  const productId = ctx.match[1];

  const products = getProducts();

  const product = products.find(
    p => p.id === productId && p.active
  );

  if (!product) {
    return ctx.answerCbQuery("Produto indisponível.");
  }

  const cart = getUserCart(ctx.from.id);

  const item = cart.items.find(
    i => i.productId === productId
  );

  if (item) {
    item.quantity++;
  } else {
    cart.items.push({
      productId,
      quantity: 1
    });
  }

  updateUserCart(cart);

  await ctx.answerCbQuery("Produto adicionado ao carrinho! 🛒");
});

// ==========================================
// VISUALIZAR CARRINHO
// ==========================================

bot.action("cart", async (ctx) => {
  await ctx.answerCbQuery();

  const cart = getUserCart(ctx.from.id);
  const products = getProducts();

  if (cart.items.length === 0) {
    return ctx.reply("🛒 Seu carrinho está vazio.");
  }

  let message = "🛒 SEU CARRINHO\n\n";

  for (const item of cart.items) {
    const product = products.find(
      p => p.id === item.productId
    );

    if (!product) continue;

    message +=
      `📦 ${product.name}\n` +
      `Quantidade: ${item.quantity}\n` +
      `Subtotal: R$ ${money(product.price * item.quantity)}\n\n`;
  }

  message += `💰 TOTAL: R$ ${money(getCartTotal(cart))}`;

  const buttons = cart.items.map(item => {
    const product = products.find(p => p.id === item.productId);

    if (!product) return null;

    return [
      Markup.button.callback(
        `➖ ${product.name}`,
        `removeone_${product.id}`
      ),
      Markup.button.callback(
        "➕",
        `addcart_${product.id}`
      )
    ];
  }).filter(Boolean);

  buttons.push([
    Markup.button.callback("🗑️ Esvaziar carrinho", "clear_cart")
  ]);

  buttons.push([
    Markup.button.callback("⬅️ Voltar", "home")
  ]);

  await ctx.reply(
    message,
    Markup.inlineKeyboard(buttons)
  );
});

// ==========================================
// REMOVER UMA UNIDADE
// ==========================================

bot.action(/^removeone_(.+)$/, async (ctx) => {
  const productId = ctx.match[1];

  const cart = getUserCart(ctx.from.id);

  const item = cart.items.find(
    i => i.productId === productId
  );

  if (!item) {
    return ctx.answerCbQuery("Produto não encontrado.");
  }

  item.quantity--;

  if (item.quantity <= 0) {
    cart.items = cart.items.filter(
      i => i.productId !== productId
    );
  }

  updateUserCart(cart);

  await ctx.answerCbQuery("Carrinho atualizado.");

  const products = getProducts();

  let message = "🛒 SEU CARRINHO\n\n";

  for (const current of cart.items) {
    const product = products.find(
      p => p.id === current.productId
    );

    if (!product) continue;

    message +=
      `📦 ${product.name}\n` +
      `Quantidade: ${current.quantity}\n` +
      `Subtotal: R$ ${money(product.price * current.quantity)}\n\n`;
  }

  message += `💰 TOTAL: R$ ${money(getCartTotal(cart))}`;

  if (cart.items.length === 0) {
    message = "🛒 Seu carrinho está vazio.";
  }

  await ctx.editMessageText(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback("🛍️ Ver produtos", "catalog")],
      [Markup.button.callback("⬅️ Voltar", "home")]
    ])
  );
});

// ==========================================
// ESVAZIAR CARRINHO
// ==========================================

bot.action("clear_cart", async (ctx) => {
  const cart = getUserCart(ctx.from.id);

  cart.items = [];

  updateUserCart(cart);

  await ctx.answerCbQuery("Carrinho esvaziado.");

  await ctx.reply("🗑️ Seu carrinho foi esvaziado.");
});

// ==========================================
// HISTÓRICO DE PEDIDOS
// ==========================================

bot.action("orders", async (ctx) => {
  await ctx.answerCbQuery();

  const orders = getOrders().filter(
    order => order.userId === ctx.from.id
  );

  if (orders.length === 0) {
    return ctx.reply("📦 Você ainda não possui pedidos.");
  }

  for (const order of orders) {
    await ctx.reply(
      `📦 PEDIDO #${order.id}\n\n` +
      `Total: R$ ${money(order.total)}\n` +
      `Status: ${order.status}`
    );
  }
});

// ==========================================
// VOLTAR AO MENU
// ==========================================

bot.action("home", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    "🏠 MENU PRINCIPAL\n\nEscolha uma opção:",
    mainMenu(isAdmin(ctx))
  );
});

// ==========================================
// COMANDO CANCELAR
// ==========================================

bot.command("cancelar", async (ctx) => {
  productSessions.delete(ctx.from.id);

  await ctx.reply("Operação cancelada.");
});

// ==========================================
// TRATAMENTO DE ERROS
// ==========================================

bot.catch((error) => {
  console.error("Erro no bot:", error);
});

// ==========================================
// INICIAR BOT
// ==========================================

bot.launch();

console.log("🤖 Bot da loja iniciado com sucesso!");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
