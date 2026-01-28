/**
 * Test TOTP Secret
 * Generates a code using your TOTP secret to verify it works
 */

require('dotenv').config();
const OTPAuth = require('otpauth');

const secret = process.env.ACTIONSTEP_TOTP_SECRET;

if (!secret) {
    console.error('❌ ACTIONSTEP_TOTP_SECRET not found in .env file');
    console.error('\nAdd it to your .env file:');
    console.error('ACTIONSTEP_TOTP_SECRET=your_secret_here');
    process.exit(1);
}

try {
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        digits: 6,
        period: 30,
    });

    const code = totp.generate();

    console.log('\n╭────────────────────────────────────╮');
    console.log('│  TOTP Code Generator Test         │');
    console.log('╰────────────────────────────────────╯\n');
    console.log(`✅ Secret loaded successfully`);
    console.log(`\n🔑 Current TOTP code: ${code}`);
    console.log(`\n⏱️  Valid for ~${30 - (Math.floor(Date.now() / 1000) % 30)} seconds`);
    console.log('\n📱 Compare this with your Authenticator app');
    console.log('   They should match!\n');

    // Show next few codes
    console.log('Next codes (for reference):');
    for (let i = 1; i <= 3; i++) {
        const futureTime = Date.now() + (30000 * i);
        const futureCode = totp.generate({ timestamp: futureTime });
        console.log(`  In ${i * 30}s: ${futureCode}`);
    }
    console.log('');

} catch (error) {
    console.error('❌ Error generating TOTP code:', error.message);
    console.error('\nCheck that your secret is valid Base32 format');
    console.error('Example: JBSWY3DPEHPK3PXP');
    process.exit(1);
}
