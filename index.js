const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
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

// تخزين بيانات الايمبد مؤقتاً لكل يوزر
const embedSessions = new Map()

client.on("messageCreate", async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const filter = m => m.author.id === message.author.id

    try {
        // =================
        // .say
        // =================
        if (command === "say") {
            const text = args.join(" ")
            if (!text) return message.reply("اكتب رسالة بعد الأمر")
            await message.channel.send(text)
        }

        // =================
        // .embed
        // =================
        if (command === "embed") {
            const fullText = args.join(" ")
            const parts = fullText.split("|")
            if (parts.length < 2) return message.reply("الاستخدام:\n.embed عنوان | وصف")

            const title = parts[0].trim()
            const description = parts[1].trim()

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor("#5865F2")
                .setTimestamp()

            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .embedwithbuttons - النظام الجديد
        // =================
        if (command === "embedwithbuttons") {
            // بيانات افتراضية للإعدادات
            const sessionData = {
                userId: message.author.id,
                channelId: message.channel.id,
                title: "",
                description: "",
                color: "#7c4dff",
                buttons: [],
                buttonCount: 0
            }
            embedSessions.set(message.author.id, sessionData)

            // عرض الـ Settings Menu زي الصورة
            await showEmbedSettings(message.channel, message.author.id, sessionData)
        }

        // =================
        // .editembed MESSAGE_ID
        // =================
        if (command === "editembed") {
            const msgId = args[0]
            if (!msgId) return message.reply("الاستخدام: .editembed MESSAGE_ID")

            const targetMessage = await message.channel.messages.fetch(msgId).catch(() => null)
            if (!targetMessage) return message.reply("مش لاقي الرسالة أو حصل خطأ")
            if (!targetMessage.embeds.length) return message.reply("الرسالة دي مفيهاش ايمبد")

            await message.reply("اكتب العنوان الجديد")
            let collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null)
            if (!collected || !collected.size) return message.reply("انتهى الوقت")
            const newTitle = collected.first().content

            await message.channel.send("اكتب الوصف الجديد")
            collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null)
            if (!collected || !collected.size) return message.reply("انتهى الوقت")
            const newDesc = collected.first().content

            const newEmbed = new EmbedBuilder()
                .setTitle(newTitle)
                .setDescription(newDesc)
                .setColor("#ff4d6d")
                .setTimestamp()

            await targetMessage.edit({ embeds: [newEmbed] })
            message.reply("تم التعديل ✅")
        }

        // =================
        // .help
        // =================
        if (command === "help") {
            const embed = new EmbedBuilder()
                .setTitle("📜 قائمة الأوامر - SpectraX Bot")
                .setDescription("اضغط على أي زر لمعرفة تفاصيل الأمر")
                .setColor("#7c4dff")

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("say_btn").setLabel(".say").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("embed_btn").setLabel(".embed").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("embedwithbuttons_btn").setLabel(".embedwithbuttons").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("editembed_btn").setLabel(".editembed").setStyle(ButtonStyle.Primary)
                )

            message.channel.send({ embeds: [embed], components: [row] })
        }

    } catch (err) {
        console.error(err)
        message.reply("حصل خطأ داخلي ⚠️")
    }
})

// =================
// دالة عرض الإعدادات زي الصورة
// =================
async function showEmbedSettings(channel, userId, data) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ إعدادات الإيمبد")
        .setDescription("من هنا تقدر تغير إعدادات الإيمبد اللي هتعمله!")
        .addFields(
            { name: "📝 العنوان", value: data.title || "لم يتم التحديد", inline: true },
            { name: "📄 الوصف", value: data.description || "لم يتم التحديد", inline: true },
            { name: "🎨 اللون", value: data.color, inline: true },
            { name: "🔘 عدد الأزرار", value: data.buttons.length > 0 ? `${data.buttons.length} أزرار` : "لا يوجد", inline: true }
        )
        .setColor(data.color)
        .setTimestamp()

    // Select Menu لاختيار الإعداد
    const selectRow = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`ewb_select_${userId}`)
                .setPlaceholder("اختار الإعداد اللي تريد تغييره!")
                .addOptions([
                    {
                        label: "📝 تغيير العنوان",
                        description: "اكتب عنوان الإيمبد",
                        value: "set_title"
                    },
                    {
                        label: "📄 تغيير الوصف",
                        description: "اكتب وصف الإيمبد",
                        value: "set_description"
                    },
                    {
                        label: "🎨 تغيير اللون",
                        description: "اختار لون للإيمبد",
                        value: "set_color"
                    },
                    {
                        label: "🔘 إضافة أزرار",
                        description: "حدد عدد الأزرار وبياناتها",
                        value: "set_buttons"
                    }
                ])
        )

    // أزرار التأكيد والإلغاء
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`ewb_send_${userId}`)
                .setLabel("✅ إرسال الإيمبد")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`ewb_cancel_${userId}`)
                .setLabel("❌ إلغاء")
                .setStyle(ButtonStyle.Danger)
        )

    return await channel.send({
        embeds: [embed],
        components: [selectRow, actionRow],
        content: `🔧 <@${userId}> - اختار الإعداد اللي تريد:`
    })
}

// =================
// Interactions Handler
// =================
client.on("interactionCreate", async interaction => {

    // ===== أزرار الـ Help =====
    if (interaction.isButton()) {
        const helpButtons = ["say_btn", "embed_btn", "embedwithbuttons_btn", "editembed_btn"]
        if (helpButtons.includes(interaction.customId)) {
            let desc = ""
            switch (interaction.customId) {
                case "say_btn":
                    desc = "**.say <نص>**\n> يرسل الرسالة اللي انت هتكتبها بنفسك"
                    break
                case "embed_btn":
                    desc = "**.embed <عنوان> | <وصف>**\n> يرسل ايمبد انت هتعمله بنفسك"
                    break
                case "embedwithbuttons_btn":
                    desc = "**.embedwithbuttons**\n> هتشوف قائمة إعدادات وتختار كل حاجة من أوبشن منفصل"
                    break
                case "editembed_btn":
                    desc = "**.editembed <MESSAGE_ID>**\n> هتعدل ايمبد موجود بنفسك"
                    break
            }
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle("شرح الأمر").setDescription(desc).setColor("#7c4dff")],
                ephemeral: true
            })
        }

        // ===== زر الإرسال =====
        if (interaction.customId.startsWith("ewb_send_")) {
            const userId = interaction.customId.replace("ewb_send_", "")
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "مش أمرك ده!", ephemeral: true })
            }

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "انتهت الجلسة، ابدأ من جديد", ephemeral: true })

            if (!data.title || !data.description) {
                return interaction.reply({ content: "⚠️ لازم تحدد العنوان والوصف الأول!", ephemeral: true })
            }

            const finalEmbed = new EmbedBuilder()
                .setTitle(data.title)
                .setDescription(data.description)
                .setColor(data.color)
                .setTimestamp()

            let components = []
            if (data.buttons.length > 0) {
                const btnRow = new ActionRowBuilder()
                    .addComponents(
                        data.buttons.map(btn =>
                            new ButtonBuilder()
                                .setLabel(btn.label)
                                .setStyle(ButtonStyle.Link)
                                .setURL(btn.url)
                        )
                    )
                components = [btnRow]
            }

            const sentMsg = await interaction.channel.send({ embeds: [finalEmbed], components })
            embedSessions.delete(userId)

            await interaction.update({ content: `✅ تم إرسال الإيمبد!\n**Message ID:** ${sentMsg.id}`, embeds: [], components: [] })
        }

        // ===== زر الإلغاء =====
        if (interaction.customId.startsWith("ewb_cancel_")) {
            const userId = interaction.customId.replace("ewb_cancel_", "")
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "مش أمرك ده!", ephemeral: true })
            }
            embedSessions.delete(userId)
            await interaction.update({ content: "❌ تم الإلغاء", embeds: [], components: [] })
        }
    }

    // ===== Select Menu =====
    if (interaction.isStringSelectMenu()) {
        if (!interaction.customId.startsWith("ewb_select_")) return

        const userId = interaction.customId.replace("ewb_select_", "")
        if (interaction.user.id !== userId) {
            return interaction.reply({ content: "مش أمرك ده!", ephemeral: true })
        }

        const data = embedSessions.get(userId)
        if (!data) return interaction.reply({ content: "انتهت الجلسة، ابدأ من جديد", ephemeral: true })

        const selected = interaction.values[0]

        // ===== تغيير العنوان =====
        if (selected === "set_title") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_title_${userId}`)
                .setTitle("تغيير العنوان")

            const input = new TextInputBuilder()
                .setCustomId("title_input")
                .setLabel("اكتب عنوان الإيمبد")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(data.title || "")

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        // ===== تغيير الوصف =====
        if (selected === "set_description") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_desc_${userId}`)
                .setTitle("تغيير الوصف")

            const input = new TextInputBuilder()
                .setCustomId("desc_input")
                .setLabel("اكتب وصف الإيمبد")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(data.description || "")

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        // ===== تغيير اللون =====
        if (selected === "set_color") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_color_${userId}`)
                .setTitle("تغيير اللون")

            const input = new TextInputBuilder()
                .setCustomId("color_input")
                .setLabel("اكتب كود اللون (مثال: #ff0000)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(data.color)

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        // ===== إضافة أزرار =====
        if (selected === "set_buttons") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_buttons_${userId}`)
                .setTitle("إضافة أزرار")

            const input = new TextInputBuilder()
                .setCustomId("buttons_input")
                .setLabel("اكتب الأزرار (اسم|لينك) كل زر في سطر")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("زر أول|https://example.com\nزر تاني|https://example2.com")

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }
    }

    // ===== Modal Submits =====
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId

        if (customId.startsWith("ewb_modal_")) {
            const parts = customId.split("_")
            // ewb_modal_title_userId  => parts[3] هو userId
            // بس userId ممكن يكون فيه _ فناخد كل اللي بعد ewb_modal_TYPE_
            const type = parts[2]
            const userId = parts.slice(3).join("_")

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "مش أمرك ده!", ephemeral: true })
            }

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "انتهت الجلسة، ابدأ من جديد", ephemeral: true })

            if (type === "title") {
                data.title = interaction.fields.getTextInputValue("title_input")
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ تم تحديث العنوان: **${data.title}**`, ephemeral: true })
            }

            if (type === "desc") {
                data.description = interaction.fields.getTextInputValue("desc_input")
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ تم تحديث الوصف!`, ephemeral: true })
            }

            if (type === "color") {
                const color = interaction.fields.getTextInputValue("color_input").trim()
                if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    return interaction.reply({ content: "⚠️ لون غلط! اكتب hex صح زي #ff0000", ephemeral: true })
                }
                data.color = color
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ تم تحديث اللون: **${data.color}**`, ephemeral: true })
            }

            if (type === "buttons") {
                const raw = interaction.fields.getTextInputValue("buttons_input")
                const lines = raw.split("\n").filter(l => l.includes("|"))
                const buttons = lines.slice(0, 5).map(line => {
                    const [label, url] = line.split("|").map(s => s.trim())
                    return { label, url }
                })
                data.buttons = buttons
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ تم إضافة ${buttons.length} أزرار!`, ephemeral: true })
            }
        }
    }
})

client.login(TOKEN)
