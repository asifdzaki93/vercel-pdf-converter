import chrome from 'chrome-aws-lambda'
import { addExtra } from 'puppeteer-extra'
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker'

// Workaround untuk masalah pada puppeteer-extra
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import ChromeAppPlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.app'
import ChromeCsiPlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.csi'
import ChromeLoadTimes from 'puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes'
import ChromeRuntimePlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.runtime'
import IFrameContentWindowPlugin from 'puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow'
import MediaCodecsPlugin from 'puppeteer-extra-plugin-stealth/evasions/media.codecs'
import NavigatorLanguagesPlugin from 'puppeteer-extra-plugin-stealth/evasions/navigator.languages'
import NavigatorPermissionsPlugin from 'puppeteer-extra-plugin-stealth/evasions/navigator.permissions'
import NavigatorPlugins from 'puppeteer-extra-plugin-stealth/evasions/navigator.plugins'
import NavigatorVendor from 'puppeteer-extra-plugin-stealth/evasions/navigator.vendor'
import NavigatorWebdriver from 'puppeteer-extra-plugin-stealth/evasions/navigator.webdriver'
import SourceUrlPlugin from 'puppeteer-extra-plugin-stealth/evasions/sourceurl'
import UserAgentOverridePlugin from 'puppeteer-extra-plugin-stealth/evasions/user-agent-override'
import WebglVendorPlugin from 'puppeteer-extra-plugin-stealth/evasions/webgl.vendor'
import WindowOuterDimensionsPlugin from 'puppeteer-extra-plugin-stealth/evasions/window.outerdimensions'

// Konfigurasi puppeteer-extra dengan plugins
const puppeteer = addExtra(chrome.puppeteer)
const plugins = [
    AdblockerPlugin({ blockTrackers: true }),
    StealthPlugin(),
    ChromeAppPlugin(),
    ChromeCsiPlugin(),
    ChromeLoadTimes(),
    ChromeRuntimePlugin(),
    IFrameContentWindowPlugin(),
    MediaCodecsPlugin(),
    NavigatorLanguagesPlugin(),
    NavigatorPermissionsPlugin(),
    NavigatorPlugins(),
    NavigatorVendor(),
    NavigatorWebdriver(),
    SourceUrlPlugin(),
    UserAgentOverridePlugin(),
    WebglVendorPlugin(),
    WindowOuterDimensionsPlugin()
]

// Atur apakah sedang dalam mode development
const isDev = process.env.NODE_ENV === 'development'

// Path ke executable Chrome pada berbagai platform
const chromeExecutables = {
    linux: '/usr/bin/chromium-browser',
    win32: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

/**
 * Fungsi untuk mendapatkan opsi peluncuran Puppeteer berdasarkan lingkungan
 * @param {boolean} isDev - Apakah dalam mode development
 * @returns {Object} - Opsi peluncuran Puppeteer
 */
export const getOptions = async (isDev) => {
    if (isDev) {
        return {
            args: [],
            executablePath: chromeExecutables[process.platform] || chromeExecutables.linux,
            headless: true
        }
    }

    // Jika bukan development, gunakan chrome-aws-lambda
    return {
        args: chrome.args,
        executablePath: await chrome.executablePath,
        headless: chrome.headless
    }
}

/**
 * Fungsi untuk menghasilkan PDF dari URL yang diberikan
 * @param {string} url - URL halaman web yang akan dikonversi ke PDF
 * @returns {Buffer} - Buffer PDF yang dihasilkan
 */
export const getPdf = async (url) => {
    // Dapatkan opsi peluncuran Puppeteer
    const options = await getOptions(isDev)
    const browser = await puppeteer.launch(options)

    try {
        // Muat semua plugins
        for (const plugin of plugins) {
            await plugin.onBrowser(browser)
        }

        const page = await browser.newPage()

        // Kunjungi URL dan tunggu hingga jaringan idle
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 8000 })

        // Tambahkan aturan CSS @page untuk memastikan orientasi landscape
        await page.addStyleTag({ content: '@page { size: A4 landscape; }' })

        // Jika diperlukan, tambahkan juga aturan CSS lainnya untuk penyesuaian
        // Contoh: memastikan lebar dan tinggi elemen sesuai dengan orientasi landscape
        // await page.addStyleTag({ content: '/* CSS tambahan */' })

        // Scroll ke bawah untuk memuat semua konten yang lazy-loaded
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0
                const distance = 100
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight
                    window.scrollBy(0, distance)
                    totalHeight += distance

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer)
                        resolve()
                    }
                }, 100) // Mengubah interval menjadi 100ms untuk performa yang lebih baik
            })
        })

        // Emulasikan media type 'screen' untuk memastikan CSS yang sesuai diterapkan
        await page.emulateMediaType('screen')

        // Konfigurasi PDF dengan opsi landscape dan A4
        const buffer = await page.pdf({
            format: 'A4',
            landscape: true,               // Menetapkan orientasi landscape
            displayHeaderFooter: false,    // Menonaktifkan header dan footer (ubah sesuai kebutuhan)
            headerTemplate: '',
            footerTemplate: '',
            printBackground: true          // Menyertakan latar belakang
        })

        return buffer
    } catch (error) {
        console.error('Error generating PDF:', error)
        return null
    } finally {
        // Pastikan browser ditutup walaupun terjadi error
        await browser.close()
    }
}
