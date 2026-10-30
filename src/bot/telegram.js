
import { Telegraf, Markup } from "telegraf";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = String(process.env.ADMIN_ID);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initializeFile(name) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]");
  return file;
}

const productsFile = initializeFile("products.json");
const cartsFile = initializeFile("carts.json");
const ordersFile = initializeFile("orders.json");

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function saveJSON(file, data) {
  if (!file) {
    throw new Error("Caminho do arquivo JSON não definido.");
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const getProducts = () => readJSON(productsFile);
const saveProducts = (data) => saveJSON(productsFile, data);

const getCarts = () => readJSON(cartsFile);
const saveCarts = (data) => saveJSON(cartsFile, data);

const getOrders = () => readJSON(ordersFile);

const sessions = new Map();

function isAdmin(ctx) {
  return String(ctx.from?.id) === ADMIN_ID;
}

function money(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// Mostra o preço com o tipo escolhido
function priceLabel(product) {
  const type = product.priceType || "unit";
  return type === "kg" ? "/kg" : "/unidade";
}

function displayPrice(product) {
  return `${money(product.price)}${priceLabel(product)}`;
}

function getCart(userId) {
  const carts = getCarts();

  return carts.find(
    (cart) => String(cart.userId) === String(userId)
  ) || {
    userId: String(userId),
    items: [],
  };
}

function updateCart(cart) {
  const carts = getCarts();

  const index = carts.findIndex(
    (item) => String(item.userId) === String(cart.userId)
  );

  if (index >= 0) carts[index] = cart;
  else carts.push(cart);

  saveCarts(carts);
}

// MENU PRINCIPAL

bot.start(async (ctx) => {
  sessions.delete(String(ctx.from.id));

  const buttons = [
    [Markup.button.callback("🛍️ Ver produtos", "catalog")],
    [Markup.button.callback("🛒 Meu carrinho", "cart")],
    [Markup.button.callback("📦 Meus pedidos", "orders")],
  ];

  if (isAdmin(ctx)) {
    buttons.push([
      Markup.button.callback("⚙️ Administração", "admin"),
    ]);
  }

  await ctx.reply(
    "Olá! Bem-vindo à nossa loja. 😊",
    Markup.inlineKeyboard(buttons)
  );
});

bot.command("cancelar", async (ctx) => {
  sessions.delete(String(ctx.from.id));
  await ctx.reply("Operação cancelada.");
});

// MENU

bot.action("home", async (ctx) => {
  await ctx.answerCbQuery();

  const buttons = [
    [Markup.button.callback("🛍️ Ver produtos", "catalog")],
    [Markup.button.callback("🛒 Meu carrinho", "cart")],
    [Markup.button.callback("📦 Meus pedidos", "orders")],
  ];

  if (isAdmin(ctx)) {
    buttons.push([
      Markup.button.callback("⚙️ Administração", "admin"),
    ]);
  }

  await ctx.reply("Menu principal:", Markup.inlineKeyboard(buttons));
});

// ADMINISTRAÇÃO

bot.action("admin", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  await ctx.reply(
    "⚙️ Administração da loja:",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ Adicionar produto", "add_product")],
      [Markup.button.callback("✏️ Editar produto", "edit_product")],
      [Markup.button.callback("🗑️ Excluir produto", "delete_product")],
      [Markup.button.callback("📋 Listar produtos", "list_products")],
      [Markup.button.callback("🏠 Menu principal", "home")],
    ])
  );
});

// CADASTRO DE PRODUTO

bot.action("add_product", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  sessions.set(String(ctx.from.id), {
    type: "add",
    step: "name",
    product: {},
  });

  await ctx.reply("Digite o nome do produto:");
});

// ESCOLHA DO TIPO DE PREÇO NO CADASTRO

bot.action("add_type_kg", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const session = sessions.get(String(ctx.from.id));

  if (!session || session.type !== "add") return;

  session.product.priceType = "kg";
  session.step = "photo";

  await ctx.reply(
    "Preço definido por kg. ⚖️\n\nAgora envie a foto do produto ou digite /semfoto."
  );
});

bot.action("add_type_unit", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const session = sessions.get(String(ctx.from.id));

  if (!session || session.type !== "add") return;

  session.product.priceType = "unit";
  session.step = "photo";

  await ctx.reply(
    "Preço definido por unidade. 📦\n\nAgora envie a foto do produto ou digite /semfoto."
  );
});

// CONFIRMAR CADASTRO

bot.action("confirm_add", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const userId = String(ctx.from.id);
  const session = sessions.get(userId);

  if (!session || session.type !== "add" || session.step !== "confirm") {
    return ctx.reply("Cadastro não encontrado.");
  }

  const products = getProducts();

  products.push({
    id: String(Date.now()),
    ...session.product,
  });

  saveProducts(products);
  sessions.delete(userId);

  await ctx.reply(
    "✅ Produto cadastrado com sucesso!",
    Markup.inlineKeyboard([
      [Markup.button.callback("➕ Adicionar outro", "add_product")],
      [Markup.button.callback("⚙️ Administração", "admin")],
    ])
  );
});

bot.action("cancel_add", async (ctx) => {
  await ctx.answerCbQuery();
  sessions.delete(String(ctx.from.id));
  await ctx.reply("Cadastro cancelado.");
});

// LISTAR PRODUTOS

bot.action("list_products", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const products = getProducts();

  if (!products.length) {
    return ctx.reply("Ainda não existem produtos cadastrados.");
  }

  for (const product of products) {
    const caption =
      `📦 ${product.name}\n\n` +
      `${product.description}\n` +
      `💰 ${displayPrice(product)}`;

    if (product.photoFileId) {
      await ctx.replyWithPhoto(product.photoFileId, {
        caption,
      });
    } else {
      await ctx.reply(caption);
    }
  }
});

// EDITAR PRODUTO

bot.action("edit_product", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const products = getProducts();

  if (!products.length) {
    return ctx.reply("Não existem produtos para editar.");
  }

  const buttons = products.map((product) => [
    Markup.button.callback(
      `✏️ ${product.name}`,
      `choose_edit_${product.id}`
    ),
  ]);

  buttons.push([
    Markup.button.callback("❌ Cancelar", "admin"),
  ]);

  await ctx.reply(
    "Qual produto deseja editar?",
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/^choose_edit_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const id = ctx.match[1];
  const product = getProducts().find(
    (item) => String(item.id) === String(id)
  );

  if (!product) return ctx.reply("Produto não encontrado.");

  sessions.set(String(ctx.from.id), {
    type: "edit",
    productId: id,
  });

  await ctx.reply(
    `Produto: ${product.name}\n` +
    `Preço atual: ${displayPrice(product)}\n\n` +
    "O que deseja alterar?",
    Markup.inlineKeyboard([
      [Markup.button.callback("📝 Nome", "edit_field_name")],
      [Markup.button.callback("📄 Descrição", "edit_field_description")],
      [Markup.button.callback("💰 Preço", "edit_field_price")],
      [Markup.button.callback("⚖️ Tipo de preço", "edit_field_type")],
      [Markup.button.callback("🖼️ Foto", "edit_field_photo")],
      [Markup.button.callback("❌ Cancelar", "cancel_edit")],
    ])
  );
});

// ESCOLHER TIPO DE PREÇO NA EDIÇÃO

bot.action("edit_field_type", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const session = sessions.get(String(ctx.from.id));

  if (!session || session.type !== "edit") {
    return ctx.reply("Sessão de edição não encontrada.");
  }

  await ctx.reply(
    "Escolha o novo tipo de preço:",
    Markup.inlineKeyboard([
      [Markup.button.callback("⚖️ Por kg", "edit_type_kg")],
      [Markup.button.callback("📦 Por unidade", "edit_type_unit")],
      [Markup.button.callback("❌ Cancelar", "cancel_edit")],
    ])
  );
});

async function changeProductType(ctx, priceType) {
  const session = sessions.get(String(ctx.from.id));

  if (!session || session.type !== "edit") {
    return ctx.reply("Sessão de edição não encontrada.");
  }

  const products = getProducts();
  const product = products.find(
    (item) => String(item.id) === String(session.productId)
  );

  if (!product) {
    sessions.delete(String(ctx.from.id));
    return ctx.reply("Produto não encontrado.");
  }

  product.priceType = priceType;
  saveProducts(products);
  sessions.delete(String(ctx.from.id));

  await ctx.reply(
    `✅ Tipo de preço atualizado!\n\n` +
    `${product.name}: ${displayPrice(product)}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Editar outro produto", "edit_product")],
      [Markup.button.callback("⚙️ Administração", "admin")],
    ])
  );
}

bot.action("edit_type_kg", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  await changeProductType(ctx, "kg");
});

bot.action("edit_type_unit", async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return;
  await changeProductType(ctx, "unit");
});

// OUTROS CAMPOS DA EDIÇÃO

const editFields = {
  name: "Digite o novo nome do produto:",
  description: "Digite a nova descrição:",
  price: "Digite o novo preço. Exemplo: 12.90",
  photo: "Envie a nova foto do produto diretamente pelo Telegram.",
};

for (const field of Object.keys(editFields)) {
  bot.action(`edit_field_${field}`, async (ctx) => {
    await ctx.answerCbQuery();

    if (!isAdmin(ctx)) return;

    const session = sessions.get(String(ctx.from.id));

    if (!session || session.type !== "edit") {
      return ctx.reply("Sessão de edição não encontrada.");
    }

    session.field = field;
    session.step = "waiting_value";

    await ctx.reply(editFields[field]);
  });
}

bot.action("cancel_edit", async (ctx) => {
  await ctx.answerCbQuery();
  sessions.delete(String(ctx.from.id));
  await ctx.reply("Edição cancelada. Nenhuma alteração foi feita.");
});

// EXCLUIR PRODUTO

bot.action("delete_product", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const products = getProducts();

  if (!products.length) {
    return ctx.reply("Não existem produtos para excluir.");
  }

  const buttons = products.map((product) => [
    Markup.button.callback(
      `🗑️ ${product.name}`,
      `delete_${product.id}`
    ),
  ]);

  buttons.push([
    Markup.button.callback("❌ Cancelar", "admin"),
  ]);

  await ctx.reply(
    "Qual produto deseja excluir?",
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/^delete_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const id = ctx.match[1];
  const products = getProducts();
  const filtered = products.filter(
    (product) => String(product.id) !== String(id)
  );

  if (filtered.length === products.length) {
    return ctx.reply("Produto não encontrado.");
  }

  saveProducts(filtered);
  await ctx.reply("✅ Produto excluído!");
});

// RECEBER MENSAGENS DO CADASTRO E DA EDIÇÃO

bot.on(["text", "photo"], async (ctx, next) => {
  const userId = String(ctx.from.id);
  const session = sessions.get(userId);

  if (!session) return next();

  if (!isAdmin(ctx)) {
    sessions.delete(userId);
    return ctx.reply("Você não tem autorização.");
  }

  const isPhoto = Boolean(ctx.message.photo);
  const text = ctx.message.text?.trim();

  if (text?.startsWith("/")) return next();

  // CADASTRO

  if (session.type === "add") {
    if (session.step === "name") {
      if (!text) return ctx.reply("Digite um nome válido.");

      session.product.name = text;
      session.step = "description";

      return ctx.reply("Digite a descrição do produto:");
    }

    if (session.step === "description") {
      if (!text) return ctx.reply("Digite uma descrição válida.");

      session.product.description = text;
      session.step = "price";

      return ctx.reply("Digite o preço. Exemplo: 12.90");
    }

    if (session.step === "price") {
      const price = Number(text?.replace(",", "."));

      if (!Number.isFinite(price) || price < 0) {
        return ctx.reply("Preço inválido. Exemplo: 12.90");
      }

      session.product.price = price;
      session.step = "priceType";

      return ctx.reply(
        "💰 Como deseja cobrar este produto?",
        Markup.inlineKeyboard([
          [Markup.button.callback("⚖️ Por kg", "add_type_kg")],
          [Markup.button.callback("📦 Por unidade", "add_type_unit")],
        ])
      );
    }

    if (session.step === "photo") {
      if (!isPhoto) {
        return ctx.reply("Envie uma foto ou digite /semfoto.");
      }

      const photos = ctx.message.photo;
      session.product.photoFileId = photos[photos.length - 1].file_id;
      session.step = "confirm";

      return ctx.reply(
        `Confira o produto:\n\n` +
        `📦 ${session.product.name}\n` +
        `📄 ${session.product.description}\n` +
        `💰 ${displayPrice(session.product)}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Salvar produto", "confirm_add")],
          [Markup.button.callback("❌ Cancelar", "cancel_add")],
        ])
      );
    }
  }

  // EDIÇÃO

  if (session.type === "edit" && session.step === "waiting_value") {
    const products = getProducts();

    const product = products.find(
      (item) => String(item.id) === String(session.productId)
    );

    if (!product) {
      sessions.delete(userId);
      return ctx.reply("Produto não encontrado.");
    }

    if (session.field === "photo") {
      if (!isPhoto) {
        return ctx.reply("Envie uma imagem como foto pelo Telegram.");
      }

      const photos = ctx.message.photo;
      product.photoFileId = photos[photos.length - 1].file_id;
    }

    if (session.field === "name") {
      if (!text) return ctx.reply("Digite um nome válido.");
      product.name = text;
    }

    if (session.field === "description") {
      if (!text) return ctx.reply("Digite uma descrição válida.");
      product.description = text;
    }

    if (session.field === "price") {
      const price = Number(text?.replace(",", "."));

      if (!Number.isFinite(price) || price < 0) {
        return ctx.reply("Preço inválido. Exemplo: 12.90");
      }

      product.price = price;
    }

    saveProducts(products);
    sessions.delete(userId);

    await ctx.reply(
      `✅ Produto atualizado!\n\n` +
      `📦 ${product.name}\n` +
      `📄 ${product.description}\n` +
      `💰 ${displayPrice(product)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✏️ Editar outro produto", "edit_product")],
        [Markup.button.callback("⚙️ Administração", "admin")],
      ])
    );
  }
});

// CADASTRO SEM FOTO

bot.command("semfoto", async (ctx) => {
  const userId = String(ctx.from.id);
  const session = sessions.get(userId);

  if (
    !isAdmin(ctx) ||
    !session ||
    session.type !== "add" ||
    session.step !== "photo"
  ) {
    return ctx.reply("Não há cadastro aguardando uma foto.");
  }

  session.product.photoFileId = null;
  session.step = "confirm";

  await ctx.reply(
    `Confira o produto:\n\n` +
    `📦 ${session.product.name}\n` +
    `📄 ${session.product.description}\n` +
    `💰 ${displayPrice(session.product)}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Salvar produto", "confirm_add")],
      [Markup.button.callback("❌ Cancelar", "cancel_add")],
    ])
  );
});

// CATÁLOGO

bot.action("catalog", async (ctx) => {
  await ctx.answerCbQuery();

  const products = getProducts();

  if (!products.length) {
    return ctx.reply("Ainda não temos produtos cadastrados.");
  }

  for (const product of products) {
    const caption =
      `📦 ${product.name}\n\n` +
      `${product.description}\n\n` +
      `💰 ${displayPrice(product)}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🛒 Adicionar ao carrinho",
          `addcart_${product.id}`
        ),
      ],
    ]);

    if (product.photoFileId) {
      await ctx.replyWithPhoto(product.photoFileId, {
        caption,
        ...keyboard,
      });
    } else {
      await ctx.reply(caption, keyboard);
    }
  }
});

// CARRINHO INDIVIDUAL

bot.action(/^addcart_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const id = ctx.match[1];
  const product = getProducts().find(
    (item) => String(item.id) === String(id)
  );

  if (!product) return ctx.reply("Produto não encontrado.");

  const cart = getCart(ctx.from.id);

  const item = cart.items.find(
    (entry) => String(entry.productId) === String(id)
  );

  if (item) item.quantity += 1;
  else cart.items.push({ productId: id, quantity: 1 });

  updateCart(cart);

  await ctx.reply(`✅ ${product.name} adicionado ao carrinho!`);
});

bot.action("cart", async (ctx) => {
  await ctx.answerCbQuery();

  const cart = getCart(ctx.from.id);
  const products = getProducts();

  if (!cart.items.length) {
    return ctx.reply("Seu carrinho está vazio.");
  }

  let total = 0;
  let message = "🛒 Seu carrinho:\n\n";

  for (const item of cart.items) {
    const product = products.find(
      (p) => String(p.id) === String(item.productId)
    );

    if (!product) continue;

    const subtotal = product.price * item.quantity;
    total += subtotal;

    message +=
      `${product.name}\n` +
      `Quantidade: ${item.quantity} ${product.priceType === "kg" ? "kg" : "unidade(s)"}\n` +
      `Preço: ${displayPrice(product)}\n` +
      `Subtotal: ${money(subtotal)}\n\n`;
  }
  message += `\n💰 Total: ${money(total)}\n`;

  await ctx.reply(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback("➖ Remover uma unidade", "remove_cart_item")],
      [Markup.button.callback("🗑️ Esvaziar carrinho", "clear_cart")],
      [Markup.button.callback("🏠 Menu principal", "home")],
    ])
  );
});

bot.action("remove_cart_item", async (ctx) => {
  await ctx.answerCbQuery();

  const cart = getCart(ctx.from.id);

  if (!cart.items.length) {
    return ctx.reply("Seu carrinho está vazio.");
  }

  const products = getProducts();

  const buttons = cart.items.map((item) => {
    const product = products.find(
      (p) => String(p.id) === String(item.productId)
    );

    if (!product) return null;

    return [
      Markup.button.callback(
        `➖ ${product.name}`,
        `remove_${product.id}`
      ),
    ];
  }).filter(Boolean);

  buttons.push([
    Markup.button.callback("Cancelar", "cart"),
  ]);

  await ctx.reply("Qual produto deseja remover?", Markup.inlineKeyboard(buttons));
});

bot.action(/^remove_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const id = ctx.match[1];
  const cart = getCart(ctx.from.id);

  const item = cart.items.find(
    (entry) => String(entry.productId) === String(id)
  );

  if (item) {
    item.quantity -= 1;

    if (item.quantity <= 0) {
      cart.items = cart.items.filter(
        (entry) => String(entry.productId) !== String(id)
      );
    }
  }

  updateCart(cart);
  await ctx.reply("Carrinho atualizado.");
});

bot.action("clear_cart", async (ctx) => {
  await ctx.answerCbQuery();

  updateCart({
    userId: String(ctx.from.id),
    items: [],
  });

  await ctx.reply("Carrinho esvaziado.");
});

// HISTÓRICO DE PEDIDOS

bot.action("orders", async (ctx) => {
  await ctx.answerCbQuery();

  const orders = getOrders().filter(
    (order) => String(order.userId) === String(ctx.from.id)
  );

  if (!orders.length) {
    return ctx.reply("Você ainda não possui pedidos.");
  }

  let message = "📦 Seus pedidos:\n\n";

  for (const order of orders) {
    message +=
      `Pedido: ${order.id}\n` +
      `Total: ${money(order.total)}\n` +
      `Status: ${order.status}\n\n`;
  }

  await ctx.reply(message);
});

// ERROS E INICIALIZAÇÃO

bot.catch((error, ctx) => {
  console.error("Erro no bot:", error);
  ctx.reply("Ocorreu um erro. Tente novamente.");
});

bot.launch();

console.log("🤖 Bot iniciado com sucesso!");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
