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
const embedSessions = new Map()

client.on("messageCreate", async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const filter = m => m.author.id === message.author.id

    try {
        if (command === "say") {
            const text = args.join(" ")
            if (!text) return message.reply("Write a message after the command")
            await message.delete().catch(() => null)
            await message.channel.send(text)
        }

        if (command === "embed") {
            const fullText = args.join(" ")
            const parts = fullText.split("|")
            if (parts.length < 2) return message.reply("Usage:\n.embed title | description")
            await message.delete().catch(() => null)

            const title = parts[0].trim()
            const description = parts[1].trim()

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor("#5865F2")
                .setTimestamp()

            await message.channel.send({ embeds: [embed] })
        }

        if (command === "embedwithbuttons") {
            await message.delete().catch(() => null)
            const sessionData = {
                userId: message.author.id,
                channelId: message.channel.id,
                title: "",
                description: "",
                color: "#7c4dff",
                buttons: []
            }
            embedSessions.set(message.author.id, sessionData)
            await showEmbedSettings(message.channel, message.author.id, sessionData)
        }

        if (command === "editembed") {
            const msgId = args[0]
            if (!msgId) return message.reply("Usage: .editembed MESSAGE_ID")
            await message.delete().catch(() => null)

            const targetMessage = await message.channel.messages.fetch(msgId).catch(() => null)
            if (!targetMessage) return message.channel.send("Message not found or an error occurred")
            if (!targetMessage.embeds.length) return message.channel.send("This message has no embed")

            const filter2 = m => m.author.id === message.author.id

            const ask1 = await message.channel.send(`<@${message.author.id}> Enter the new title`)
            let collected = await message.channel.awaitMessages({ filter: filter2, max: 1, time: 60000 }).catch(() => null)
            if (!collected || !collected.size) return message.channel.send("Timed out")
            const newTitle = collected.first().content
            await ask1.delete().catch(() => null)
            await collected.first().delete().catch(() => null)

            const ask2 = await message.channel.send(`<@${message.author.id}> Enter the new description`)
            collected = await message.channel.awaitMessages({ filter: filter2, max: 1, time: 60000 }).catch(() => null)
            if (!collected || !collected.size) return message.channel.send("Timed out")
            const newDesc = collected.first().content
            await ask2.delete().catch(() => null)
            await collected.first().delete().catch(() => null)

            const newEmbed = new EmbedBuilder()
                .setTitle(newTitle)
                .setDescription(newDesc)
                .setColor("#ff4d6d")
                .setTimestamp()

            await targetMessage.edit({ embeds: [newEmbed] })
        }

        if (command === "help") {
            await message.delete().catch(() => null)
            const embed = new EmbedBuilder()
                .setTitle("📜 Commands List - SpectraX Bot")
                .setDescription("Click any button to see command details")
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
        message.channel.send("Internal error occurred ⚠️")
    }
})

async function showEmbedSettings(channel, userId, data) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Embed Settings")
        .setDescription("Change your embed settings from here!")
        .addFields(
            { name: "📝 Title", value: data.title || "Not set", inline: true },
            { name: "📄 Description", value: data.description || "Not set", inline: true },
            { name: "🎨 Color", value: data.color, inline: true },
            { name: "🔘 Buttons", value: data.buttons.length > 0 ? `${data.buttons.length} button(s)` : "None", inline: true }
        )
        .setColor(data.color)
        .setTimestamp()

    const selectRow = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`ewb_select_${userId}`)
                .setPlaceholder("Select a setting to change!")
                .addOptions([
                    { label: "📝 Set Title", description: "Set the embed title", value: "set_title" },
                    { label: "📄 Set Description", description: "Set the embed description", value: "set_description" },
                    { label: "🎨 Set Color", description: "Set the embed color", value: "set_color" },
                    { label: "🔘 Add Buttons", description: "Add link buttons to the embed", value: "set_buttons" }
                ])
        )

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`ewb_send_${userId}`)
                .setLabel("✅ Send Embed")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`ewb_cancel_${userId}`)
                .setLabel("❌ Cancel")
                .setStyle(ButtonStyle.Danger)
        )

    return await channel.send({
        embeds: [embed],
        components: [selectRow, actionRow],
        content: `🔧 <@${userId}> - Select a setting to change:`
    })
}

client.on("interactionCreate", async interaction => {

    if (interaction.isButton()) {
        const helpButtons = ["say_btn", "embed_btn", "embedwithbuttons_btn", "editembed_btn"]
        if (helpButtons.includes(interaction.customId)) {
            let desc = ""
            switch (interaction.customId) {
                case "say_btn":
                    desc = "**.say <text>**\n> Sends the message you write"
                    break
                case "embed_btn":
                    desc = "**.embed <title> | <description>**\n> Sends an embed you create"
                    break
                case "embedwithbuttons_btn":
                    desc = "**.embedwithbuttons**\n> Opens a settings menu to build your embed with buttons"
                    break
                case "editembed_btn":
                    desc = "**.editembed <MESSAGE_ID>**\n> Edits an existing embed"
                    break
            }
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle("Command Info").setDescription(desc).setColor("#7c4dff")],
                ephemeral: true
            })
        }

        if (interaction.customId.startsWith("ewb_send_")) {
            const userId = interaction.customId.replace("ewb_send_", "")
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "This is not your menu!", ephemeral: true })
            }

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })

            if (!data.title || !data.description) {
                return interaction.reply({ content: "⚠️ You must set a title and description first!", ephemeral: true })
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

            await interaction.channel.send({ embeds: [finalEmbed], components })
            embedSessions.delete(userId)
            await interaction.update({ content: "", embeds: [], components: [] })
        }

        if (interaction.customId.startsWith("ewb_cancel_")) {
            const userId = interaction.customId.replace("ewb_cancel_", "")
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "This is not your menu!", ephemeral: true })
            }
            embedSessions.delete(userId)
            await interaction.update({ content: "❌ Cancelled", embeds: [], components: [] })
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (!interaction.customId.startsWith("ewb_select_")) return

        const userId = interaction.customId.replace("ewb_select_", "")
        if (interaction.user.id !== userId) {
            return interaction.reply({ content: "This is not your menu!", ephemeral: true })
        }

        const data = embedSessions.get(userId)
        if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })

        const selected = interaction.values[0]

        if (selected === "set_title") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_title_${userId}`)
                .setTitle("Set Title")

            const input = new TextInputBuilder()
                .setCustomId("title_input")
                .setLabel("Enter the embed title")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(data.title || "")

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        if (selected === "set_description") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_desc_${userId}`)
                .setTitle("Set Description")

            const input = new TextInputBuilder()
                .setCustomId("desc_input")
                .setLabel("Enter the embed description")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(data.description || "")

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        if (selected === "set_color") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_color_${userId}`)
                .setTitle("Set Color")

            const input = new TextInputBuilder()
                .setCustomId("color_input")
                .setLabel("Enter color code (e.g. #ff0000)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(data.color)

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        if (selected === "set_buttons") {
            const modal = new ModalBuilder()
                .setCustomId(`ewb_modal_buttons_${userId}`)
                .setTitle("Add Buttons")

            const input = new TextInputBuilder()
                .setCustomId("buttons_input")
                .setLabel("Enter buttons (label|url), one per line")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("Button 1|https://example.com\nButton 2|https://example2.com")

            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }
    }

    if (interaction.isModalSubmit()) {
        const customId = interaction.customId

        if (customId.startsWith("ewb_modal_")) {
            const parts = customId.split("_")
            const type = parts[2]
            const userId = parts.slice(3).join("_")

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "This is not your menu!", ephemeral: true })
            }

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })

            if (type === "title") {
                data.title = interaction.fields.getTextInputValue("title_input")
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Title updated: **${data.title}**`, ephemeral: true })
            }

            if (type === "desc") {
                data.description = interaction.fields.getTextInputValue("desc_input")
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Description updated!`, ephemeral: true })
            }

            if (type === "color") {
                const color = interaction.fields.getTextInputValue("color_input").trim()
                if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
                    return interaction.reply({ content: "⚠️ Invalid color! Use hex format like #ff0000", ephemeral: true })
                }
                data.color = color
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Color updated: **${data.color}**`, ephemeral: true })
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
                await interaction.reply({ content: `✅ Added ${buttons.length} button(s)!`, ephemeral: true })
            }
        }
    }
})

client.login(TOKEN)
