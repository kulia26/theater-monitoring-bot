// @ts-check
import { test, expect } from '@playwright/test';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if(!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not provided');

const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;

if(!TELEGRAM_GROUP_ID) throw new Error('TELEGRAM_GROUP_ID not provided');

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

const monitoringTitles = [
  /Конотопська відьма/,
  /Грек Зорба/,
];

async function getMaxPages(page) {
  await page.goto('https://sales.ft.org.ua/events');
  const pages = await page.$$eval('li.pagination__item a', links =>
    links.map(a => parseInt(a.textContent)).filter(Number)
  );
  return pages.length > 0 ? Math.max(...pages) : 1;
}

async function getAllEventCards(browser) {
  const page = await browser.newPage();
  const cards = {};
  const maxPages = await getMaxPages(page);

  for (let i = 1; i <= maxPages; i++) {
    const url = `https://sales.ft.org.ua/events?page=${i}`;
    await page.goto(url);
    const elements = await page.$$('a.performanceCard');

    for (const card of elements) {
      const title = await card.$eval('h3.performanceCard__title', node => node.textContent.trim());
      const href = await card.getAttribute('href');
      if (!cards[title]) cards[title] = [];
      cards[title].push(`${href}`);
    }

    await page.waitForTimeout(400);
  }

  await page.close();
  return cards;
}

async function checkTickets(browser, eventLink) {
  const page = await browser.newPage();
  await page.goto(eventLink);

  const occupied = await (await page.getByText('Вільні місця, на жаль, закінчились')).isVisible();

  console.log({occupied, eventLink});


  await page.close();
  
  return !occupied;
}

async function sendMessage(text) {
  await bot.sendMessage(TELEGRAM_GROUP_ID, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
}

test('get started link', async ({ browser }) => {
  const allCards = await getAllEventCards(browser);
  let message = "Доступні квитки:\n";
  let ticketsFound = false;

  for (const [title, links] of Object.entries(allCards)) {
    if (!monitoringTitles.some(re => re.test(title))) continue;

    for (const link of links) {
      const free = await checkTickets(browser, link);

      if (free) {
        message += `\n[${title}](${link}) є вільні місця}\n`;
        ticketsFound = true;
      }
    }
  }

  if (ticketsFound) {
      console.log({message})

    await sendMessage(message);
  }

  await browser.close();
});
