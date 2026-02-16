/**
 * Backend API for Stripe Payment Integration
 * Node.js/Express example
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const app = express();

app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Guard my email API is running' });
});

/**
 * Create Stripe Checkout Session
 * Called when user clicks "Upgrade" button
 */
app.post('/create-checkout-session', async (req, res) => {
  const { priceId, customerEmail, mode } = req.body;
  
  try {
    const session = await stripe.checkout.sessions.create({
      mode: mode || 'subscription',
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: 'https://guardmyemail.com/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://guardmyemail.com/upgrade',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        userEmail: customerEmail
      }
    });
    
    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stripe Webhook Handler
 */
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      await handleSuccessfulPayment(session);
      break;
      
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      await handleCancellation(subscription);
      break;
      
    case 'invoice.payment_failed':
      const invoice = event.data.object;
      await handleFailedPayment(invoice);
      break;
      
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
  
  res.json({ received: true });
});

async function handleSuccessfulPayment(session) {
  const customerEmail = session.customer_email || session.metadata.userEmail;
  const subscriptionId = session.subscription;
  
  console.log(`Payment successful for: ${customerEmail}`);
  console.log(`Subscription ID: ${subscriptionId}`);
}

async function handleCancellation(subscription) {
  const customerId = subscription.customer;
  const customer = await stripe.customers.retrieve(customerId);
  const customerEmail = customer.email;
  
  console.log(`Subscription cancelled for: ${customerEmail}`);
}

async function handleFailedPayment(invoice) {
  const customerEmail = invoice.customer_email;
  console.log(`Payment failed for: ${customerEmail}`);
}

app.post('/create-portal-session', async (req, res) => {
  const { customerEmail } = req.body;
  
  try {
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1
    });
    
    if (customers.data.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    const customer = customers.data[0];
    
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: 'https://guardmyemail.com/account',
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/subscription-status/:email', async (req, res) => {
  const email = req.params.email;
  
  try {
    const customers = await stripe.customers.list({
      email: email,
      limit: 1
    });
    
    if (customers.data.length === 0) {
      return res.json({ tier: 'free', active: false });
    }
    
    const customer = customers.data[0];
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });
    
    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0];
      return res.json({
        tier: 'paid',
        active: true,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      });
    }
    
    res.json({ tier: 'free', active: false });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Payment API running on port ${PORT}`);
});

module.exports = app;
