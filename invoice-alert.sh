#!/bin/bash
# Invoice Alert Monitor
# Checks both email accounts for invoice-related emails and alerts via Telegram

LOG_FILE="/Users/obiwon/.openclaw/workspace/logs/invoice-alerts.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure log directory exists
mkdir -p $(dirname $LOG_FILE)

echo "[$DATE] Checking for invoices..." >> $LOG_FILE

# Run Python script to check emails
python3 << 'EOF'
import json, imaplib, email, sys
from datetime import datetime, timedelta

def check_invoices(creds_file, account_name):
    """Check for invoice-related emails in last 24 hours"""
    invoices = []
    
    try:
        with open(creds_file) as f:
            creds = json.load(f)
        
        mail = imaplib.IMAP4_SSL(creds.get('host', 'imap.gmail.com'), 993)
        mail.login(creds.get('email'), creds.get('app_password'))
        mail.select('inbox')
        
        # Search for emails from last 24 hours
        since_date = (datetime.now() - timedelta(days=1)).strftime("%d-%b-%Y")
        status, messages = mail.search(None, f'SINCE {since_date}')
        
        if status != 'OK' or not messages[0]:
            mail.logout()
            return invoices
        
        # Invoice keywords
        invoice_keywords = ['invoice', 'facture', 'billing', 'payment due', 'amount due', 'bill', 'receipt', 'paiement', 'facturation']
        
        # Excluded senders (marketing/newsletters)
        excluded_senders = ['mckinsey', 'linkedin', 'newsletter', 'marketing', 'noreply']
        
        recent_ids = messages[0].split()[-50:]  # Check last 50 emails
        
        for e_id in recent_ids:
            try:
                status, msg_data = mail.fetch(e_id, '(RFC822)')
                if status == 'OK':
                    msg = email.message_from_bytes(msg_data[0][1])
                    subject = msg.get('Subject', '').lower()
                    from_addr = msg.get('From', '')
                    date_str = msg.get('Date', '')
                    
                    # Check if subject contains invoice keywords
                    for keyword in invoice_keywords:
                        if keyword in subject:
                            # Check if unread
                            status, flags = mail.fetch(e_id, '(FLAGS)')
                            is_unread = '\\Seen' not in str(flags[0])
                            
                            invoices.append({
                                'account': account_name,
                                'from': from_addr,
                                'subject': msg.get('Subject', ''),
                                'date': date_str,
                                'keyword': keyword,
                                'unread': is_unread
                            })
                            break
            except:
                continue
        
        mail.close()
        mail.logout()
    except Exception as e:
        print(f"Error checking {account_name}: {e}", file=sys.stderr)
    
    return invoices

# Check both accounts
all_invoices = []
all_invoices.extend(check_invoices('/Users/obiwon/.openclaw/credentials/obiwonkim-email.json', 'obiwonkim'))
all_invoices.extend(check_invoices('/Users/obiwon/.openclaw/credentials/wonword-email.json', 'wonword'))

# Output results
if all_invoices:
    print(f"🚨 INVOICE ALERT: Found {len(all_invoices)} invoice(s)!")
    for inv in all_invoices:
        status = "🔴 NEW" if inv['unread'] else "✓ Seen"
        print(f"\n📧 {inv['account']}@gmail.com")
        print(f"   From: {inv['from']}")
        print(f"   Subject: {inv['subject']}")
        print(f"   Status: {status}")
else:
    print("✓ No invoices found in last 24 hours")
EOF

RESULT=$?

echo "[$DATE] Check complete" >> $LOG_FILE

exit $RESULT
