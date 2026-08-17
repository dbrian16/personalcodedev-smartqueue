import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface FeedbackFormProps {
  onSubmit: (rating: number, comment: string) => void;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');

  return (
    <div className="space-y-4">
      {/* Stars */}
      <div className="flex justify-center space-x-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded"
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              size={36}
              className={
                star <= (hovered || rating)
                  ? 'text-yellow-400 drop-shadow'
                  : 'text-gray-300'
              }
              fill={star <= (hovered || rating) ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>

      {/* Comment */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience (optional)..."
        rows={3}
        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-blue-500 outline-none text-sm resize-none transition-all"
      />

      {/* Submit */}
      <button
        type="button"
        disabled={rating === 0}
        onClick={() => onSubmit(rating, comment.trim() || 'No comment')}
        className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        Submit Feedback
      </button>
      {rating === 0 && (
        <p className="text-xs text-center text-gray-400">Please select a star rating first</p>
      )}
    </div>
  );
};

export default FeedbackForm;
