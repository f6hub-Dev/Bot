const {
Client,
GatewayIntentBits,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle
} = require("discord.js")

const TOKEN = process.env.TOKEN

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
})

const prefix = "."

client.on("messageCreate", async (message) => {

if (message.author.bot) return
if (!message.content.startsWith(prefix)) return

const args = message.content.slice(prefix.length).trim().split(/ +/)
const command = args.shift().toLowerCase()

// =================
// .say
// =================
if (command === "say") {

const text = args.join(" ")
if (!text) return message.reply("اكتب رسالة بعد الأمر")

message.channel.send(text)
}

// =================
// .embed
// الاستخدام:
// .embed عنوان | وصف
// =================
if (command === "embed") {

const fullText = args.join(" ")
const parts = fullText.split("|")

if (parts.length < 2)
return message.reply("الاستخدام:\n.embed عنوان | وصف")

const title = parts[0].trim()
const description = parts[1].trim()

const embed = new EmbedBuilder()
.setTitle(title)
.setDescription(description)
.setColor("#5865F2")
.setTimestamp()

message.channel.send({ embeds: [embed] })
}

// =================
// .embedwithbuttons
// =================
if (command === "embedwithbuttons") {

const filter = m => m.author.id === message.author.id

await message.reply("اكتب عنوان الايمبد")
let collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")
const title = collected.first().content

await message.channel.send("اكتب وصف الايمبد")
collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")
const description = collected.first().content

await message.channel.send("عايز كام زر؟ (1-5)")
collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")

const count = parseInt(collected.first().content)
if (isNaN(count) || count < 1 || count > 5)
return message.reply("لازم رقم من 1 لـ 5")

const buttons = []

for (let i = 1; i <= count; i++) {

await message.channel.send(`اكتب اسم الزر رقم ${i}`)
collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")
const label = collected.first().content

await message.channel.send(`حط لينك الزر رقم ${i}`)
collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")
const link = collected.first().content

buttons.push(
new ButtonBuilder()
.setLabel(label)
.setStyle(ButtonStyle.Link)
.setURL(link)
)
}

const row = new ActionRowBuilder().addComponents(buttons)

const embed = new EmbedBuilder()
.setTitle(title)
.setDescription(description)
.setColor("#7c4dff")
.setTimestamp()

const sentMessage = await message.channel.send({
embeds: [embed],
components: [row]
})

message.reply(`تم الإنشاء ✅\nMessage ID:\n${sentMessage.id}`)
}

// =================
// .editembed MESSAGE_ID
// =================
if (command === "editembed") {

const msgId = args[0]
if (!msgId) return message.reply("الاستخدام: .editembed MESSAGE_ID")

try {

const targetMessage = await message.channel.messages.fetch(msgId)

if (!targetMessage.embeds.length)
return message.reply("الرسالة دي مفيهاش ايمبد")

const filter = m => m.author.id === message.author.id

await message.reply("اكتب العنوان الجديد")
let collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")
const newTitle = collected.first().content

await message.channel.send("اكتب الوصف الجديد")
collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 })
if (!collected.size) return message.reply("انتهى الوقت")
const newDesc = collected.first().content

const newEmbed = new EmbedBuilder()
.setTitle(newTitle)
.setDescription(newDesc)
.setColor("#ff4d6d")
.setTimestamp()

await targetMessage.edit({ embeds: [newEmbed] })

message.reply("تم التعديل ✅")

} catch (err) {
message.reply("مش لاقي الرسالة أو حصل خطأ")
}

}

})

client.login(TOKEN)