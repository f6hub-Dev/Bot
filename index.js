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
const fs = require("fs")

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
const scriptPanelSessions = new Map()
const setupSessions = new Map()

// =================
// Load/Save JSON Data
// =================
const DATA_FILE = "./data.json"

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ scriptButtons: [], permissions: {}, giveaways: {} }, null, 2))
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    if (!data.giveaways) data.giveaways = {}
    return data
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

// =================
// Permission Check
// =================
function hasPermission(member, command) {
    const data = loadData()
    if (!data.permissions[command]) return true
    const allowedRoles = data.permissions[command]
    return member.roles.cache.some(role => allowedRoles.includes(role.id))
}

// =================
// Parse Duration
// =================
function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/)
    if (!match) return null
    const value = parseInt(match[1])
    const unit = match[2]
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 }
    return value * multipliers[unit]
}

function formatDuration(ms) {
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
}

// =================
// End Giveaway
// =================
async function endGiveaway(giveawayId) {
    const data = loadData()
    const gw = data.giveaways[giveawayId]
    if (!gw || gw.ended) return

    const guild = client.guilds.cache.get(gw.guildId)
    if (!guild) return
    const channel = guild.channels.cache.get(gw.channelId)
    if (!channel) return

    const msg = await channel.messages.fetch(gw.messageId).catch(() => null)
    if (!msg) return

    const entries = gw.entries || []
    const winnerCount = gw.winnerCount || 1
    const winners = []

    const shuffled = [...entries].sort(() => Math.random() - 0.5)
    for (let i = 0; i < Math.min(winnerCount, shuffled.length); i++) {
        winners.push(shuffled[i])
    }

    gw.ended = true
    gw.winners = winners
    data.giveaways[giveawayId] = gw
    saveData(data)

    const winnerText = winners.length > 0
        ? winners.map(id => `<@${id}>`).join(", ")
        : "No winners (no entries)"

    const endEmbed = new EmbedBuilder()
        .setTitle("🎉 Giveaway Ended!")
        .setDescription(`**Prize:** ${gw.prize}\n\n🏆 **Winner(s):** ${winnerText}`)
        .addFields(
            { name: "Total Entries", value: `${entries.length}`, inline: true },
            { name: "Winners", value: `${winners.length}`, inline: true }
        )
        .setColor("#ff4d6d")
        .setTimestamp()

    const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("gw_ended")
            .setLabel(`🎉 Giveaway Ended - ${entries.length} entries`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    )

    await msg.edit({ embeds: [endEmbed], components: [disabledRow] })

    if (winners.length > 0) {
        await channel.send(`🎊 Congratulations ${winnerText}! You won **${gw.prize}**!`)
    } else {
        await channel.send("😔 No one entered the giveaway!")
    }
}

// =================
// Restore Active Giveaways on Bot Start
// =================
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`)

    const data = loadData()
    const now = Date.now()

    for (const [id, gw] of Object.entries(data.giveaways)) {
        if (gw.ended) continue
        const remaining = gw.endTime - now
        if (remaining <= 0) {
            endGiveaway(id)
        } else {
            setTimeout(() => endGiveaway(id), remaining)
        }
    }
})

client.on("messageCreate", async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    try {

        // =================
        // .say
        // =================
        if (command === "say") {
            if (!hasPermission(message.member, "say")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            const text = args.join(" ")
            if (!text) return message.reply("Write a message after the command")
            await message.delete().catch(() => null)
            await message.channel.send(text)
        }

        // =================
        // .embed
        // =================
        if (command === "embed") {
            if (!hasPermission(message.member, "embed")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            const fullText = args.join(" ")
            const parts = fullText.split("|")
            if (parts.length < 2) return message.reply("Usage:\n.embed title | description")
            await message.delete().catch(() => null)

            const embed = new EmbedBuilder()
                .setTitle(parts[0].trim())
                .setDescription(parts[1].trim())
                .setColor("#5865F2")
                .setTimestamp()

            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .embedwithbuttons
        // =================
        if (command === "embedwithbuttons") {
            if (!hasPermission(message.member, "embedwithbuttons")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
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

        // =================
        // .editembed
        // =================
        if (command === "editembed") {
            if (!hasPermission(message.member, "editembed")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
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

        // =================
        // .getscript
        // =================
        if (command === "getscript") {
            const data = loadData()

            if (!data.scriptButtons || data.scriptButtons.length === 0) {
                const m = await message.reply("❌ No scripts available yet!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return
            }

            const embed = new EmbedBuilder()
                .setTitle("📜 Available Scripts")
                .setDescription("Click a button below to get the script!")
                .setColor("#7c4dff")
                .setTimestamp()

            const rows = []
            for (let i = 0; i < data.scriptButtons.length; i += 5) {
                const chunk = data.scriptButtons.slice(i, i + 5)
                const row = new ActionRowBuilder().addComponents(
                    chunk.map((btn, idx) =>
                        new ButtonBuilder()
                            .setCustomId(`getscript_btn_${i + idx}`)
                            .setLabel(btn.label)
                            .setStyle(ButtonStyle.Primary)
                    )
                )
                rows.push(row)
            }

            await message.channel.send({ embeds: [embed], components: rows })
        }

        // =================
        // .giveaway
        // =================
        if (command === "giveaway") {
            if (!hasPermission(message.member, "giveaway")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)

            const modal = new ModalBuilder()
                .setCustomId("giveaway_modal")
                .setTitle("🎉 Create Giveaway")

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("gw_prize")
                        .setLabel("Prize")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("e.g. Nitro, Robux, etc.")
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("gw_duration")
                        .setLabel("Duration (e.g. 10s, 5m, 2h, 1d)")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("10s / 5m / 2h / 1d")
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("gw_winners")
                        .setLabel("Number of Winners")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("e.g. 1")
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("gw_role")
                        .setLabel("Required Role ID (leave empty = everyone)")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("Role ID or leave empty")
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("gw_description")
                        .setLabel("Extra Description (optional)")
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder("Any extra info about the giveaway...")
                        .setRequired(false)
                )
            )

            // نحتاج نحفظ channel id عشان نستخدمه في الـ modal submit
            // بنحطه في map مؤقت
            embedSessions.set(`gw_channel_${message.author.id}`, message.channel.id)

            await message.member.send({ content: "📋 Please fill in the giveaway details:" }).catch(() => null)

            // مش هينفع نعمل showModal من message، لازم interaction
            // هنستخدم approach تاني - نبعت رسالة بزر يفتح الـ modal
            const triggerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`gw_open_modal_${message.author.id}_${message.channel.id}`)
                    .setLabel("🎉 Fill Giveaway Details")
                    .setStyle(ButtonStyle.Success)
            )

            const triggerMsg = await message.channel.send({
                content: `<@${message.author.id}> Click the button to fill in the giveaway details!`,
                components: [triggerRow]
            })

            // بنحذف الرسالة دي بعد دقيقتين لو مفعلتش
            setTimeout(() => triggerMsg.delete().catch(() => null), 120000)
        }

        // =================
        // .rerolllastgiveaway
        // =================
        if (command === "rerolllastgiveaway") {
            if (!hasPermission(message.member, "giveaway")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)

            const data = loadData()
            const ended = Object.entries(data.giveaways)
                .filter(([, gw]) => gw.ended && gw.guildId === message.guild.id)
                .sort(([, a], [, b]) => b.endTime - a.endTime)

            if (ended.length === 0) {
                const m = await message.channel.send("❌ No ended giveaways found!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return
            }

            const [lastId, lastGw] = ended[0]
            const entries = lastGw.entries || []

            if (entries.length === 0) {
                const m = await message.channel.send("❌ No entries in the last giveaway!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return
            }

            const winnerCount = lastGw.winnerCount || 1
            const shuffled = [...entries].sort(() => Math.random() - 0.5)
            const newWinners = shuffled.slice(0, Math.min(winnerCount, shuffled.length))

            lastGw.winners = newWinners
            data.giveaways[lastId] = lastGw
            saveData(data)

            const winnerText = newWinners.map(id => `<@${id}>`).join(", ")

            const embed = new EmbedBuilder()
                .setTitle("🔁 Giveaway Rerolled!")
                .setDescription(`**Prize:** ${lastGw.prize}\n\n🏆 **New Winner(s):** ${winnerText}`)
                .setColor("#ffd700")
                .setTimestamp()

            await message.channel.send({ embeds: [embed] })
            await message.channel.send(`🎊 Congratulations ${winnerText}! You won **${lastGw.prize}**!`)
        }

        // =================
        // .setupscriptpanel (Owner only)
        // =================
        if (command === "setupscriptpanel") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)

            const data = loadData()
            const session = {
                userId: message.author.id,
                buttons: data.scriptButtons ? [...data.scriptButtons] : []
            }
            scriptPanelSessions.set(message.author.id, session)
            await showScriptPanelSettings(message.channel, message.author.id, session)
        }

        // =================
        // .setup (Owner only)
        // =================
        if (command === "setup") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)

            const data = loadData()
            const session = {
                userId: message.author.id,
                permissions: data.permissions ? { ...data.permissions } : {},
                selectedCommand: null
            }
            setupSessions.set(message.author.id, session)
            await showSetupPanel(message.channel, message.author.id, session)
        }

        // =================
        // .help
        // =================
        if (command === "help") {
            await message.delete().catch(() => null)
            const embed = new EmbedBuilder()
                .setTitle("📜 Commands List - SpectraX Bot")
                .setDescription("Click any button to see command details")
                .setColor("#7c4dff")

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("say_btn").setLabel(".say").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("embed_btn").setLabel(".embed").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("embedwithbuttons_btn").setLabel(".embedwithbuttons").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("editembed_btn").setLabel(".editembed").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("getscript_help_btn").setLabel(".getscript").setStyle(ButtonStyle.Primary)
                )

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("giveaway_help_btn").setLabel(".giveaway").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("reroll_help_btn").setLabel(".rerolllastgiveaway").setStyle(ButtonStyle.Success)
                )

            message.channel.send({ embeds: [embed], components: [row1, row2] })
        }

    } catch (err) {
        console.error(err)
        message.channel.send("Internal error occurred ⚠️")
    }
})

// =================
// Show Functions
// =================
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

    const selectRow = new ActionRowBuilder().addComponents(
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

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ewb_send_${userId}`).setLabel("✅ Send Embed").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ewb_cancel_${userId}`).setLabel("❌ Cancel").setStyle(ButtonStyle.Danger)
    )

    return await channel.send({ embeds: [embed], components: [selectRow, actionRow], content: `🔧 <@${userId}> - Select a setting to change:` })
}

async function showScriptPanelSettings(channel, userId, session) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Script Panel Settings")
        .setDescription("Manage the buttons that appear in `.getscript`")
        .addFields({
            name: "📋 Current Buttons",
            value: session.buttons.length > 0 ? session.buttons.map((b, i) => `**${i + 1}.** ${b.label}`).join("\n") : "No buttons yet"
        })
        .setColor("#7c4dff")
        .setTimestamp()

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`ssp_select_${userId}`)
            .setPlaceholder("Select an action")
            .addOptions([
                { label: "➕ Add Button", description: "Add a new script button", value: "add_button" },
                { label: "🗑️ Remove Button", description: "Remove an existing button", value: "remove_button" },
                { label: "💾 Save & Finish", description: "Save all changes", value: "save_panel" }
            ])
    )

    return await channel.send({ embeds: [embed], components: [selectRow], content: `🔧 <@${userId}> - Script Panel Settings:` })
}

async function showSetupPanel(channel, userId, session) {
    const commands = ["say", "embed", "embedwithbuttons", "editembed", "getscript", "giveaway"]
    const data = loadData()

    const embed = new EmbedBuilder()
        .setTitle("⚙️ Permissions Setup")
        .setDescription("Select a command to set which roles can use it.\nIf no roles are set, everyone can use it.")
        .addFields(
            commands.map(cmd => ({
                name: `.${cmd}`,
                value: data.permissions[cmd] && data.permissions[cmd].length > 0
                    ? data.permissions[cmd].map(id => `<@&${id}>`).join(", ")
                    : "Everyone",
                inline: true
            }))
        )
        .setColor("#5865F2")
        .setTimestamp()

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`setup_cmd_select_${userId}`)
            .setPlaceholder("Select a command to configure")
            .addOptions(commands.map(cmd => ({ label: `.${cmd}`, description: `Set roles for .${cmd}`, value: cmd })))
    )

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup_save_${userId}`).setLabel("💾 Save & Close").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`setup_reset_${userId}`).setLabel("🔄 Reset All Permissions").setStyle(ButtonStyle.Danger)
    )

    return await channel.send({ embeds: [embed], components: [selectRow, actionRow], content: `🔧 <@${userId}> - Permissions Setup Panel:` })
}

// =================
// Interactions Handler
// =================
client.on("interactionCreate", async interaction => {

    if (interaction.isButton()) {

        // ===== Open Giveaway Modal Button =====
        if (interaction.customId.startsWith("gw_open_modal_")) {
            const parts = interaction.customId.split("_")
            const userId = parts[3]
            const channelId = parts[4]

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: "This is not your button!", ephemeral: true })
            }

            embedSessions.set(`gw_channel_${userId}`, channelId)

            const modal = new ModalBuilder()
                .setCustomId(`giveaway_modal_${userId}`)
                .setTitle("🎉 Create Giveaway")

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("gw_prize").setLabel("Prize").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Nitro, Robux, etc.").setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("gw_duration").setLabel("Duration (e.g. 10s, 5m, 2h, 1d)").setStyle(TextInputStyle.Short).setPlaceholder("10s / 5m / 2h / 1d").setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("gw_winners").setLabel("Number of Winners").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 1").setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("gw_role").setLabel("Required Role ID (leave empty = everyone)").setStyle(TextInputStyle.Short).setPlaceholder("Role ID or leave empty").setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("gw_description").setLabel("Extra Description (optional)").setStyle(TextInputStyle.Paragraph).setPlaceholder("Any extra info...").setRequired(false)
                )
            )

            await interaction.message.delete().catch(() => null)
            return await interaction.showModal(modal)
        }

        // ===== Help Buttons =====
        const helpMap = {
            "say_btn": "**.say <text>**\n> Sends the message you write",
            "embed_btn": "**.embed <title> | <description>**\n> Sends an embed you create",
            "embedwithbuttons_btn": "**.embedwithbuttons**\n> Opens a settings menu to build your embed with buttons",
            "editembed_btn": "**.editembed <MESSAGE_ID>**\n> Edits an existing embed",
            "getscript_help_btn": "**.getscript**\n> Shows available scripts panel",
            "giveaway_help_btn": "**.giveaway**\n> Creates a giveaway with a modal form\n> Options: prize, duration, winners count, required role",
            "reroll_help_btn": "**.rerolllastgiveaway**\n> Rerolls the last ended giveaway in this server"
        }

        if (helpMap[interaction.customId]) {
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle("Command Info").setDescription(helpMap[interaction.customId]).setColor("#7c4dff")],
                ephemeral: true
            })
        }

        // ===== Get Script Buttons =====
        if (interaction.customId.startsWith("getscript_btn_")) {
            const index = parseInt(interaction.customId.replace("getscript_btn_", ""))
            const data = loadData()
            const btn = data.scriptButtons[index]
            if (!btn) return interaction.reply({ content: "❌ Script not found!", ephemeral: true })

            const embed = new EmbedBuilder()
                .setTitle(`📜 ${btn.label}`)
                .setDescription(`\`\`\`lua\n${btn.script}\n\`\`\``)
                .setColor("#7c4dff")
                .setTimestamp()

            return await interaction.reply({ embeds: [embed], ephemeral: true })
        }

        // ===== Giveaway Enter Button =====
        if (interaction.customId.startsWith("gw_enter_")) {
            const giveawayId = interaction.customId.replace("gw_enter_", "")
            const data = loadData()
            const gw = data.giveaways[giveawayId]

            if (!gw || gw.ended) return interaction.reply({ content: "❌ This giveaway has ended!", ephemeral: true })

            // Check required role
            if (gw.requiredRole) {
                const member = interaction.member
                if (!member.roles.cache.has(gw.requiredRole)) {
                    const role = interaction.guild.roles.cache.get(gw.requiredRole)
                    return interaction.reply({ content: `❌ You need the **${role ? role.name : "required"}** role to enter!`, ephemeral: true })
                }
            }

            if (!gw.entries) gw.entries = []

            if (gw.entries.includes(interaction.user.id)) {
                // Remove entry (toggle)
                gw.entries = gw.entries.filter(id => id !== interaction.user.id)
                data.giveaways[giveawayId] = gw
                saveData(data)

                // Update message
                const msg = await interaction.channel.messages.fetch(gw.messageId).catch(() => null)
                if (msg) {
                    const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
                        .spliceFields(2, 1, { name: "👥 Entries", value: `${gw.entries.length}`, inline: true })
                    const updatedRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`gw_enter_${giveawayId}`).setLabel(`🎉 Enter Giveaway (${gw.entries.length})`).setStyle(ButtonStyle.Success)
                    )
                    await msg.edit({ embeds: [updatedEmbed], components: [updatedRow] })
                }

                return interaction.reply({ content: "✅ You have **left** the giveaway!", ephemeral: true })
            }

            gw.entries.push(interaction.user.id)
            data.giveaways[giveawayId] = gw
            saveData(data)

            // Update message
            const msg = await interaction.channel.messages.fetch(gw.messageId).catch(() => null)
            if (msg) {
                const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
                    .spliceFields(2, 1, { name: "👥 Entries", value: `${gw.entries.length}`, inline: true })
                const updatedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`gw_enter_${giveawayId}`).setLabel(`🎉 Enter Giveaway (${gw.entries.length})`).setStyle(ButtonStyle.Success)
                )
                await msg.edit({ embeds: [updatedEmbed], components: [updatedRow] })
            }

            return interaction.reply({ content: "🎉 You have **entered** the giveaway! Good luck!", ephemeral: true })
        }

        // ===== EWB Send =====
        if (interaction.customId.startsWith("ewb_send_")) {
            const userId = interaction.customId.replace("ewb_send_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })
            if (!data.title || !data.description) return interaction.reply({ content: "⚠️ You must set a title and description first!", ephemeral: true })

            const finalEmbed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp()
            let components = []
            if (data.buttons.length > 0) {
                components = [new ActionRowBuilder().addComponents(
                    data.buttons.map(btn => new ButtonBuilder().setLabel(btn.label).setStyle(ButtonStyle.Link).setURL(btn.url))
                )]
            }

            await interaction.channel.send({ embeds: [finalEmbed], components })
            embedSessions.delete(userId)
            await interaction.update({ content: "", embeds: [], components: [] })
        }

        // ===== EWB Cancel =====
        if (interaction.customId.startsWith("ewb_cancel_")) {
            const userId = interaction.customId.replace("ewb_cancel_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })
            embedSessions.delete(userId)
            await interaction.update({ content: "❌ Cancelled", embeds: [], components: [] })
        }

        // ===== Setup Save =====
        if (interaction.customId.startsWith("setup_save_")) {
            const userId = interaction.customId.replace("setup_save_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const data = loadData()
            data.permissions = session.permissions
            saveData(data)
            setupSessions.delete(userId)

            await interaction.update({ content: "✅ Permissions saved successfully!", embeds: [], components: [] })
        }

        // ===== Setup Reset =====
        if (interaction.customId.startsWith("setup_reset_")) {
            const userId = interaction.customId.replace("setup_reset_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            session.permissions = {}
            setupSessions.set(userId, session)
            const data = loadData()
            data.permissions = {}
            saveData(data)

            await interaction.update({ content: "🔄 All permissions have been reset!", embeds: [], components: [] })
        }

        // ===== Setup Clear Command =====
        if (interaction.customId.startsWith("setup_clear_cmd_")) {
            const userId = interaction.customId.replace("setup_clear_cmd_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session || !session.selectedCommand) return interaction.reply({ content: "Session expired.", ephemeral: true })

            delete session.permissions[session.selectedCommand]
            setupSessions.set(userId, session)

            return await interaction.update({
                content: `✅ **.${session.selectedCommand}** is now accessible by **everyone**!\n\nDon't forget to press **💾 Save & Close**!`,
                components: []
            })
        }
    }

    // ===== Select Menus =====
    if (interaction.isStringSelectMenu()) {

        // EWB Select
        if (interaction.customId.startsWith("ewb_select_")) {
            const userId = interaction.customId.replace("ewb_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const selected = interaction.values[0]
            const modals = {
                set_title: { id: `ewb_modal_title_${userId}`, title: "Set Title", field: { id: "title_input", label: "Enter the embed title", style: TextInputStyle.Short, val: data.title } },
                set_description: { id: `ewb_modal_desc_${userId}`, title: "Set Description", field: { id: "desc_input", label: "Enter the embed description", style: TextInputStyle.Paragraph, val: data.description } },
                set_color: { id: `ewb_modal_color_${userId}`, title: "Set Color", field: { id: "color_input", label: "Enter color code (e.g. #ff0000)", style: TextInputStyle.Short, val: data.color } },
                set_buttons: { id: `ewb_modal_buttons_${userId}`, title: "Add Buttons", field: { id: "buttons_input", label: "Enter buttons (label|url), one per line", style: TextInputStyle.Paragraph, val: "" } }
            }

            const m = modals[selected]
            if (!m) return

            const modal = new ModalBuilder().setCustomId(m.id).setTitle(m.title)
            const input = new TextInputBuilder().setCustomId(m.field.id).setLabel(m.field.label).setStyle(m.field.style).setRequired(true)
            if (m.field.val) input.setValue(m.field.val)
            if (selected === "set_buttons") input.setPlaceholder("Button 1|https://example.com\nButton 2|https://example2.com").setRequired(false)
            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        // Script Panel Select
        if (interaction.customId.startsWith("ssp_select_")) {
            const userId = interaction.customId.replace("ssp_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const selected = interaction.values[0]

            if (selected === "add_button") {
                const modal = new ModalBuilder().setCustomId(`ssp_modal_add_${userId}`).setTitle("Add Script Button")
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("btn_label").setLabel("Button Label").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("btn_script").setLabel("Script (loadstring content)").setStyle(TextInputStyle.Paragraph).setRequired(true))
                )
                return await interaction.showModal(modal)
            }

            if (selected === "remove_button") {
                if (session.buttons.length === 0) return interaction.reply({ content: "❌ No buttons to remove!", ephemeral: true })
                const removeSelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`ssp_remove_select_${userId}`)
                        .setPlaceholder("Select button to remove")
                        .addOptions(session.buttons.map((btn, i) => ({ label: btn.label, value: `${i}` })))
                )
                return await interaction.reply({ content: "Select which button to remove:", components: [removeSelect], ephemeral: true })
            }

            if (selected === "save_panel") {
                const data = loadData()
                data.scriptButtons = session.buttons
                saveData(data)
                scriptPanelSessions.delete(userId)
                return await interaction.update({ content: "✅ Script panel saved successfully!", embeds: [], components: [] })
            }
        }

        // Script Panel Remove Select
        if (interaction.customId.startsWith("ssp_remove_select_")) {
            const userId = interaction.customId.replace("ssp_remove_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const index = parseInt(interaction.values[0])
            const removed = session.buttons.splice(index, 1)
            scriptPanelSessions.set(userId, session)
            return await interaction.update({ content: `✅ Removed button: **${removed[0].label}**`, components: [] })
        }

        // Setup Command Select
        if (interaction.customId.startsWith("setup_cmd_select_")) {
            const userId = interaction.customId.replace("setup_cmd_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const selectedCmd = interaction.values[0]
            session.selectedCommand = selectedCmd
            setupSessions.set(userId, session)

            const roles = interaction.guild.roles.cache
                .filter(r => !r.managed && r.id !== interaction.guild.id)
                .first(25)
                .map(r => ({ label: r.name, value: r.id }))

            if (roles.length === 0) return interaction.reply({ content: "❌ No roles found!", ephemeral: true })

            const roleSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`setup_role_select_${userId}`)
                    .setPlaceholder(`Select roles for .${selectedCmd}`)
                    .setMinValues(1)
                    .setMaxValues(Math.min(roles.length, 25))
                    .addOptions(roles)
            )

            const clearRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_clear_cmd_${userId}`)
                    .setLabel(`🔓 Allow Everyone for .${selectedCmd}`)
                    .setStyle(ButtonStyle.Secondary)
            )

            return await interaction.reply({ content: `Select roles for **.${selectedCmd}**:`, components: [roleSelect, clearRow], ephemeral: true })
        }

        // Setup Role Select
        if (interaction.customId.startsWith("setup_role_select_")) {
            const userId = interaction.customId.replace("setup_role_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session || !session.selectedCommand) return interaction.reply({ content: "Session expired.", ephemeral: true })

            session.permissions[session.selectedCommand] = interaction.values
            setupSessions.set(userId, session)

            const roleNames = interaction.values.map(id => `<@&${id}>`).join(", ")
            return await interaction.update({
                content: `✅ Roles for **.${session.selectedCommand}**: ${roleNames}\n\nPress **💾 Save & Close** in the main panel!`,
                components: []
            })
        }
    }

    // ===== Modal Submits =====
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId

        // EWB Modals
        if (customId.startsWith("ewb_modal_")) {
            const parts = customId.split("_")
            const type = parts[2]
            const userId = parts.slice(3).join("_")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired.", ephemeral: true })

            if (type === "title") { data.title = interaction.fields.getTextInputValue("title_input"); embedSessions.set(userId, data); await interaction.reply({ content: `✅ Title updated: **${data.title}**`, ephemeral: true }) }
            if (type === "desc") { data.description = interaction.fields.getTextInputValue("desc_input"); embedSessions.set(userId, data); await interaction.reply({ content: `✅ Description updated!`, ephemeral: true }) }
            if (type === "color") {
                const color = interaction.fields.getTextInputValue("color_input").trim()
                if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return interaction.reply({ content: "⚠️ Invalid color!", ephemeral: true })
                data.color = color; embedSessions.set(userId, data); await interaction.reply({ content: `✅ Color updated: **${data.color}**`, ephemeral: true })
            }
            if (type === "buttons") {
                const raw = interaction.fields.getTextInputValue("buttons_input")
                const buttons = raw.split("\n").filter(l => l.includes("|")).slice(0, 5).map(line => { const [label, url] = line.split("|").map(s => s.trim()); return { label, url } })
                data.buttons = buttons; embedSessions.set(userId, data); await interaction.reply({ content: `✅ Added ${buttons.length} button(s)!`, ephemeral: true })
            }
        }

        // Script Panel Modal
        if (customId.startsWith("ssp_modal_add_")) {
            const userId = customId.replace("ssp_modal_add_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const label = interaction.fields.getTextInputValue("btn_label")
            const script = interaction.fields.getTextInputValue("btn_script")

            if (session.buttons.length >= 25) return interaction.reply({ content: "❌ Maximum 25 buttons!", ephemeral: true })

            session.buttons.push({ label, script })
            scriptPanelSessions.set(userId, session)
            await interaction.reply({ content: `✅ Button **${label}** added! Select **Save & Finish** when done.`, ephemeral: true })
        }

        // Giveaway Modal
        if (customId.startsWith("giveaway_modal_")) {
            const userId = customId.replace("giveaway_modal_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your modal!", ephemeral: true })

            const channelId = embedSessions.get(`gw_channel_${userId}`)
            const channel = interaction.guild.channels.cache.get(channelId)
            if (!channel) return interaction.reply({ content: "❌ Channel not found!", ephemeral: true })

            const prize = interaction.fields.getTextInputValue("gw_prize")
            const durationStr = interaction.fields.getTextInputValue("gw_duration")
            const winnersStr = interaction.fields.getTextInputValue("gw_winners")
            const roleId = interaction.fields.getTextInputValue("gw_role").trim()
            const description = interaction.fields.getTextInputValue("gw_description").trim()

            const duration = parseDuration(durationStr)
            if (!duration) return interaction.reply({ content: "❌ Invalid duration! Use: 10s, 5m, 2h, 1d", ephemeral: true })

            const winnerCount = parseInt(winnersStr)
            if (isNaN(winnerCount) || winnerCount < 1) return interaction.reply({ content: "❌ Invalid winner count!", ephemeral: true })

            const endTime = Date.now() + duration
            const giveawayId = `${interaction.guild.id}_${Date.now()}`

            const fields = [
                { name: "⏱️ Ends", value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
                { name: "🏆 Winners", value: `${winnerCount}`, inline: true },
                { name: "👥 Entries", value: "0", inline: true },
                { name: "🎟️ Required Role", value: roleId ? `<@&${roleId}>` : "None", inline: true },
                { name: "🎯 Hosted by", value: `<@${userId}>`, inline: true }
            ]

            if (description) fields.push({ name: "📝 Info", value: description, inline: false })

            const gwEmbed = new EmbedBuilder()
                .setTitle(`🎉 GIVEAWAY - ${prize}`)
                .setDescription("Click the button below to enter!")
                .addFields(fields)
                .setColor("#ffd700")
                .setTimestamp(endTime)

            const enterRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`gw_enter_${giveawayId}`)
                    .setLabel("🎉 Enter Giveaway (0)")
                    .setStyle(ButtonStyle.Success)
            )

            const gwMsg = await channel.send({ embeds: [gwEmbed], components: [enterRow] })

            const data = loadData()
            data.giveaways[giveawayId] = {
                guildId: interaction.guild.id,
                channelId: channel.id,
                messageId: gwMsg.id,
                prize,
                duration,
                endTime,
                winnerCount,
                requiredRole: roleId || null,
                entries: [],
                ended: false,
                winners: []
            }
            saveData(data)

            embedSessions.delete(`gw_channel_${userId}`)

            setTimeout(() => endGiveaway(giveawayId), duration)

            await interaction.reply({ content: `✅ Giveaway created in <#${channel.id}>!`, ephemeral: true })
        }
    }
})

client.login(TOKEN)
