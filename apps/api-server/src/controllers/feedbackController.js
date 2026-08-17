const catchAsync = require('../utils/catchAsync');
const store = require('../store');
const socket = require('../socket');
const { nowUtc } = require('../utils/validators');

const { throwError } = require('../utils/AppError');

/**
 * Checks if a customer is authorized to access a specific lead (ticket).
 */
const customerCanAccessLead = (user, lead) =>
  user &&
  user.userType === 'customer' &&
  (String(user.userId) === String(lead.id) || user.ticketNumber === lead.ticketNumber);

/**
 * Submits feedback for a specific ticket.
 *
 * Completed tickets only, submitted once. A waiting ticket
 * could previously be rated, and a rating could be overwritten without limit,
 * which made the CSAT figure on the dashboard unaudited.
 */
exports.submitFeedback = catchAsync(async (req, res) => {
  const { leadId, rating, comment } = req.body;

  if (!leadId) throwError('leadId required');

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    throwError('Rating must be between 1 and 5');
  }

  const lead = await store.getLeadById(leadId);
  if (!lead) throwError('Lead not found', 404);

  if (req.user.userType === 'customer' && !customerCanAccessLead(req.user, lead)) {
    throwError('Cannot submit feedback for this ticket', 403);
  }

  if (lead.status !== 'Completed') {
    throwError('Feedback can only be given once your service session is complete.', 409);
  }

  if (lead.feedback) {
    throwError('Feedback has already been submitted for this ticket.', 409);
  }

  lead.feedback = {
    rating: Math.round(rating),
    comment: typeof comment === 'string' ? comment.trim() : '',
    date: nowUtc()
  };

  const updatedLead = await store.saveLead(lead);
  socket.emitToAdmins('feedback_received', store.publicLead(updatedLead));

  res.json({ message: 'Feedback saved successfully', rating: lead.feedback.rating });
});
